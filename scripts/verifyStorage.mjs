import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { createServer } from 'vite';

const dataKey = 'taskflow_v1_data';
const tokenKey = 'taskflow_v1_token';
const token = 'v1-demo-token';
const draft = { title: '存储断言', desc: '', status: 'todo', priority: 'low' };
const makeSnapshot = () => ({
  schemaVersion: 1,
  projects: [{ id: '1700000000000', name: '保留项目', desc: '', createTime: 1700000000000 }],
  tasks: [
    {
      ...draft,
      id: '1700000000001',
      createTime: 1700000000000,
      projectId: '1700000000000',
      parentId: null,
      dueDate: null,
    },
  ],
});

async function withFixture(rawValue, run, options = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map(rawValue === null ? [] : [[dataKey, rawValue]]);
  const fault = { readKeys: new Set(), writeKeys: new Set(), writes: [], ...options };
  const storage = {
    getItem(key) {
      if (fault.readKeys.has(key)) throw new Error('read denied');
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      fault.writes.push(key);
      if (fault.writeKeys.has(key)) throw new Error('quota');
      memory.set(key, String(value));
    },
    removeItem(key) {
      if (fault.writeKeys.has(key)) throw new Error('remove denied');
      memory.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  let server;
  try {
    server = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false,
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
    });
    await server.ssrLoadModule('/src/mock/index.js');
    const repo = await server.ssrLoadModule('/src/mock/repository.js');
    const { default: request } = await server.ssrLoadModule('/src/api/request.js');
    const client = axios.create({
      baseURL: '/api',
      adapter: request.defaults.adapter,
      headers: { Authorization: token },
    });
    setActivePinia(createPinia());
    const taskDraft = {
      ...draft,
      projectId: repo.getState()?.projects[0]?.id || '1700000000000',
    };
    await run({ memory, fault, repo, client, server, taskDraft });
  } finally {
    await server?.close();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

export async function verifyStorage() {
  for (const original of [
    '{{ broken json',
    JSON.stringify({ schemaVersion: 999, projects: [], tasks: [] }),
  ]) {
    await withFixture(original, async ({ memory, fault, repo, client, taskDraft }) => {
      assert.equal(memory.get(dataKey), original, '启动不能覆盖损坏或未知版本原值');
      assert.equal(fault.writes.length, 0);
      assert.equal(repo.getState(), null);
      assert.equal((await client.get('/tasks')).data.code, 400);
      assert.equal((await client.post('/tasks', taskDraft)).data.code, 400);
      assert.equal((await client.post('/storage/reset', {})).data.code, 400);
      assert.equal(memory.get(dataKey), original, '未确认重置不能写入');
      assert.equal((await client.post('/storage/retry')).data.code, 400);
      assert.equal(memory.get(dataKey), original, '重试不能覆盖坏数据');
      fault.writeKeys.add(dataKey);
      assert.equal((await client.post('/storage/reset', { confirmed: true })).data.code, 400);
      assert.equal(memory.get(dataKey), original, '重置写失败保留原值');
      assert.equal(repo.getState(), null);
      fault.writeKeys.clear();
      assert.equal((await client.post('/storage/reset', { confirmed: true })).data.code, 200);
      assert.equal(repo.getState().tasks.length, 3);
      assert.equal(
        (await client.post('/storage/reset', { confirmed: true })).data.code,
        400,
        '有效数据不提供损坏重置'
      );
    });
  }
  console.log('PASS: 损坏/未知版本原值保留、禁止写入、确认重置及重置失败保护');

  const original = JSON.stringify(makeSnapshot());
  await withFixture(
    original,
    async ({ memory, fault, repo, client }) => {
      assert.equal(memory.get(dataKey), original);
      assert.equal(fault.writes.length, 0);
      assert.equal(repo.getRepositoryStatus().kind, 'read-error');
      assert.equal((await client.post('/storage/reset', { confirmed: true })).data.code, 400);
      fault.readKeys.clear();
      assert.equal((await client.post('/storage/retry')).data.code, 200);
      assert.equal(repo.getState().tasks.length, 1);
      assert.equal(memory.get(dataKey), original);
    },
    { readKeys: new Set([dataKey]) }
  );

  await withFixture(
    null,
    async ({ memory, fault, repo, client }) => {
      assert.equal(memory.has(dataKey), false);
      assert.equal(repo.getState(), null, '首次写失败不能发布内存');
      assert.equal(repo.getRepositoryStatus().kind, 'write-error');
      assert.equal((await client.get('/tasks')).data.code, 400);
      fault.writeKeys.clear();
      assert.equal((await client.post('/storage/retry')).data.code, 200);
      assert.equal(repo.getState().tasks.length, 3);
      assert.equal(fault.writes.filter((key) => key === dataKey).length, 2);
    },
    { writeKeys: new Set([dataKey]) }
  );
  console.log('PASS: 读取异常独立反馈、首次写失败不发布内存及重试');

  await withFixture(null, async ({ memory, fault, repo, client, taskDraft }) => {
    const before = repo.getState();
    const beforeRaw = memory.get(dataKey);
    fault.writeKeys.add(dataKey);
    fault.writes.length = 0;
    const failed = (await client.post('/tasks', taskDraft)).data;
    assert.equal(failed.code, 400);
    assert.match(failed.msg, /存储|保存/);
    assert.equal(fault.writes.filter((key) => key === dataKey).length, 1, '必须真正触发setItem');
    assert.deepEqual(repo.getState(), before);
    assert.equal(memory.get(dataKey), beforeRaw);
    fault.writeKeys.clear();
    assert.equal((await client.post('/tasks', taskDraft)).data.code, 200);
    assert.equal(repo.getState().tasks.length, 4, '重试只新增一次');
    const state = repo.getState();
    const raw = memory.get(dataKey);
    const stringify = JSON.stringify;
    let result;
    try {
      JSON.stringify = () => {
        throw new Error('serialize failed');
      };
      result = repo.saveSnapshot((snapshot) => snapshot);
    } finally {
      JSON.stringify = stringify;
    }
    assert.equal(result.ok, false);
    assert.deepEqual(repo.getState(), state);
    assert.equal(memory.get(dataKey), raw);
  });
  console.log('PASS: 合法候选确实触发写失败、内存/存储回滚、重试不重复及序列化错误');

  await withFixture(null, async ({ memory, fault, server, repo }) => {
    const { useUserStore } = await server.ssrLoadModule('/src/stores/user.js');
    const { authGuard } = await server.ssrLoadModule('/src/router/guard.js');
    const user = useUserStore();
    memory.set('legacy-sentinel', 'untouched');
    fault.writeKeys.add(tokenKey);
    await assert.rejects(user.login({ username: 'audit', password: 'demo' }), /存储|保存/);
    assert.equal(user.isLoggedIn, false);
    assert.equal(memory.has(tokenKey), false);
    assert.equal(authGuard({ path: '/task-list' }), '/login');
    fault.writeKeys.clear();
    await user.login({ username: 'audit', password: 'demo' });
    assert.equal(user.isLoggedIn, true);
    assert.equal(memory.get(tokenKey), token);
    assert.equal(authGuard({ path: '/task-list' }), true);
    const saved = JSON.stringify(repo.getState());
    assert.equal(user.logout().ok, true);
    assert.equal(memory.has(tokenKey), false);
    assert.equal(JSON.stringify(repo.getState()), saved, '退出保留业务数据');
    assert.equal(memory.get('legacy-sentinel'), 'untouched');
    assert.equal(authGuard({ path: '/task-list' }), '/login');
    fault.readKeys.add(tokenKey);
    assert.equal(authGuard({ path: '/login' }), true);
    assert.equal(authGuard({ path: '/task-list' }), '/login');
  });
  console.log('PASS: Token保存失败无假登录、V1守卫、退出保留业务数据及读取异常');

  const empty = makeSnapshot();
  empty.tasks = [];
  await withFixture(JSON.stringify(empty), async ({ repo, fault }) => {
    assert.equal(repo.getState().tasks.length, 0);
    assert.equal(fault.writes.length, 0);
  });
  let saved;
  await withFixture(null, async ({ memory, fault, client, taskDraft }) => {
    const created = (await client.post('/tasks', taskDraft)).data;
    assert.equal(created.code, 200);
    assert.equal(
      (await client.put(`/tasks/${created.data.id}`, { title: '重载保留', status: 'done' })).data
        .code,
      200
    );
    const seed = (await client.get('/tasks')).data.data.list.find(
      (task) => task.id !== created.data.id
    );
    assert.equal((await client.delete(`/tasks/${seed.id}`)).data.code, 200);
    assert.equal(fault.writes.filter((key) => key === dataKey).length, 4);
    saved = memory.get(dataKey);
  });
  await withFixture(saved, async ({ client, fault, taskDraft }) => {
    const result = (await client.get('/tasks')).data;
    assert.equal(result.data.total, 3);
    assert(result.data.list.some((task) => task.title === '重载保留' && task.status === 'done'));
    assert.equal(fault.writes.length, 0);
    const now = Date.now;
    try {
      Date.now = () => 1700000000001;
      const created = (await client.post('/tasks', taskDraft)).data;
      assert.equal(created.code, 200, '独立模块重载且时钟回拨时仍可新增');
      assert(
        BigInt(created.data.id) >
          BigInt(
            JSON.parse(saved).tasks.reduce(
              (max, task) => (BigInt(task.id) > BigInt(max) ? task.id : max),
              '0'
            )
          )
      );
    } finally {
      Date.now = now;
    }
  });
  console.log('PASS: 合法空任务、CRUD单次写入、独立模块重载及ID高水位恢复');

  const exhausted = makeSnapshot();
  exhausted.projects[0].id = '8640000000000000';
  exhausted.tasks = [];
  const exhaustedRaw = JSON.stringify(exhausted);
  await withFixture(exhaustedRaw, async ({ client, memory, fault, taskDraft }) => {
    const result = (await client.post('/tasks', taskDraft)).data;
    assert.equal(result.code, 400);
    assert.match(result.msg, /ID/);
    assert.equal(memory.get(dataKey), exhaustedRaw);
    assert.equal(fault.writes.length, 0);
  });
  console.log('PASS: ID范围耗尽时返回业务错误并保留有效快照');
}
