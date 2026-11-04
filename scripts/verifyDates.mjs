import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createPinia, setActivePinia } from 'pinia';
import { createServer } from 'vite';
import { ElMessage } from 'element-plus';
import { getLocalDate, isDueDate, isOverdue, toLocalDate } from '../src/utils/date.js';
import { debounce } from '../src/utils/debounce.js';

export async function verifyDates() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {getLocalDate,toLocalDate} from './src/utils/date.js';
      for(const value of ['0001-01-01','0004-02-29','0099-12-31','2000-02-29']) assert.equal(getLocalDate(toLocalDate(value)),value);
      for(const iso of ['2026-10-31T01:30:00Z','2026-03-08T09:30:00Z','2026-12-31T23:30:00Z']) {
        const date=new Date(iso);
        const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
        const part=type=>parts.find(p=>p.type===type).value;
        assert.equal(getLocalDate(date),part('year')+'-'+part('month')+'-'+part('day'));
      }
    `,
      ],
      { cwd: root, env: { ...process.env, TZ: zone }, windowsHide: true }
    );
  }
  const early = new Date();
  early.setFullYear(4, 1, 29);
  assert.equal(getLocalDate(early), '0004-02-29');
  assert.throws(() => getLocalDate(new Date(NaN)), /无效/);
  assert(isDueDate('2000-02-29'));
  assert(!isDueDate('1900-02-29'));
  assert.equal(toLocalDate(null), null);
  assert.throws(() => toLocalDate('1900-02-29'), /无效/);
  const now = new Date();
  const today = getLocalDate(now);
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  const yesterday = getLocalDate(previous);
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const tomorrow = getLocalDate(next);
  const sample = { parentId: null, status: 'todo', dueDate: yesterday };
  assert(isOverdue(sample, today));
  for (const task of [
    { ...sample, dueDate: today },
    { ...sample, dueDate: tomorrow },
    { ...sample, dueDate: null },
    { ...sample, status: 'done' },
    { ...sample, parentId: '1' },
    { ...sample, dueDate: '2026-02-30' },
  ])
    assert.equal(isOverdue(task, today), false);
  let invoked = 0;
  const debounced = debounce(() => invoked++, 10);
  debounced();
  debounced.cancel();
  await delay(30);
  assert.equal(invoked, 0);
  debounced();
  await delay(30);
  assert.equal(invoked, 1);
  console.log(
    'PASS: 四时区本地日期、跨年/DST边界、真实日历日期、当天不逾期/完成及子任务排除、防抖取消'
  );

  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousMessage = ElMessage.error;
  const memory = new Map();
  let writes = 0;
  let failWrites = false;
  let server;
  let request;
  let adapter;
  ElMessage.error = () => {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => memory.get(key) ?? null,
      setItem(key, value) {
        if (key === 'taskflow_v1_data') {
          writes++;
          if (failWrites) throw new Error('模拟日期写失败');
        }
        memory.set(key, String(value));
      },
      removeItem: (key) => memory.delete(key),
    },
  });
  try {
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom',
    });
    await server.ssrLoadModule('/src/mock/index.js');
    ({ default: request } = await server.ssrLoadModule('/src/api/request.js'));
    adapter = request.defaults.adapter;
    const { getState, saveSnapshot, initRepository } =
      await server.ssrLoadModule('/src/mock/repository.js');
    const { genId } = await server.ssrLoadModule('/src/utils/id.js');
    const { TOKEN_KEY, DATA_KEY, DEMO_TOKEN } = await server.ssrLoadModule('/src/utils/storage.js');
    const { getTaskList } = await server.ssrLoadModule('/src/api/task.js');
    const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
    memory.set(TOKEN_KEY, DEMO_TOKEN);
    setActivePinia(createPinia());
    const store = useTaskStore();
    const projectId = getState().projects[0].id;
    const draft = Object.freeze({
      title: '日期任务',
      desc: '',
      status: 'todo',
      priority: 'medium',
      projectId,
      dueDate: '2024-02-29',
    });
    const task = await store.addTask(draft);
    assert.equal(task.dueDate, draft.dueDate);
    assert.equal(draft.dueDate, '2024-02-29');
    assert.equal(
      (await request.put(`/tasks/${task.id}`, { desc: '省略日期' })).dueDate,
      draft.dueDate
    );
    assert.equal((await request.put(`/tasks/${task.id}`, { dueDate: null })).dueDate, null);
    for (const value of [
      '',
      '2026-02-30',
      '1900-02-29',
      '0000-01-01',
      '2026-2-01',
      '2026-10-31T00:00:00Z',
      123,
      false,
    ]) {
      const before = getState();
      const raw = memory.get(DATA_KEY);
      const beforeWrites = writes;
      await assert.rejects(request.post('/tasks', { ...draft, dueDate: value }));
      await assert.rejects(request.put(`/tasks/${task.id}`, { dueDate: value }));
      assert.deepEqual(getState(), before);
      assert.equal(memory.get(DATA_KEY), raw);
      assert.equal(writes, beforeWrites);
    }
    for (const body of [{ id: '123' }, { createTime: 0 }]) {
      await assert.rejects(request.put(`/tasks/${task.id}`, body), /不可修改/);
    }
    for (const body of [[], [1], true, 123, null]) {
      const before = getState();
      const beforeWrites = writes;
      await assert.rejects(
        request.put(`/tasks/${task.id}`, JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
      assert.equal(writes, beforeWrites);
      assert.deepEqual(getState(), before);
    }
    const child = await store.addSubtask(task.id, {
      title: '日期规则子任务',
      desc: '',
      projectId,
      priority: task.priority,
    });
    await assert.rejects(request.put(`/tasks/${child.id}`, { dueDate: today }), /dueDate/);
    await assert.rejects(
      request.post('/tasks', { ...draft, parentId: task.id, dueDate: today }),
      /子任务不能/
    );
    const secondProject = await request.post('/projects', { name: '日期验收第二项目', desc: '' });
    for (const body of [
      { ...draft, parentId: child.id, dueDate: null },
      { ...draft, parentId: task.id, projectId: secondProject.id, dueDate: null },
      { ...draft, parentId: task.id, status: 'doing', dueDate: null },
      { ...draft, parentId: '9999999999999999', dueDate: null },
    ]) {
      const before = getState();
      const beforeWrites = writes;
      await assert.rejects(request.post('/tasks', body));
      assert.equal(writes, beforeWrites);
      assert.deepEqual(getState(), before);
    }
    console.log(
      'PASS: 截止日期新增/省略保留/null清除；非法日期、不可变字段及非法子任务关联均拒绝且不写入'
    );

    const before = getState();
    const raw = memory.get(DATA_KEY);
    const cache = JSON.stringify(store.taskList);
    failWrites = true;
    await assert.rejects(store.editTask(task.id, { dueDate: yesterday }), /存储写入失败/);
    await assert.rejects(store.addTask(draft), /存储写入失败/);
    assert.deepEqual(getState(), before);
    assert.equal(memory.get(DATA_KEY), raw);
    assert.equal(JSON.stringify(store.taskList), cache);
    failWrites = false;
    let beforeWrites = writes;
    await store.editTask(task.id, { dueDate: yesterday });
    assert.equal(writes - beforeWrites, 1);
    request.defaults.adapter = (config) => {
      if (config.method === 'get') throw new Error('日期保存后刷新失败');
      return adapter(config);
    };
    beforeWrites = writes;
    const created = await store.addTask({ ...draft, title: '已保存待刷新' });
    assert.equal(writes - beforeWrites, 1);
    assert.equal(created.dueDate, draft.dueDate);
    const saved = await store.editTask(created.id, { dueDate: null });
    assert.equal(saved.dueDate, null);
    assert.match(store.listError, /刷新失败/);
    request.defaults.adapter = adapter;
    beforeWrites = writes;
    await store.fetchTasks();
    assert.equal(writes, beforeWrites);
    assert.equal(store.listError, '');
    console.log(
      'PASS: 日期写失败保留内存/存储/Store，恢复单次保存；新增/编辑成功与刷新失败分开，重试仅查询'
    );

    assert.equal(
      saveSnapshot((state) => {
        state.tasks = [];
        const make = (title, dueDate, status = 'todo', pid = projectId) => ({
          id: genId(),
          title,
          desc: '',
          status,
          priority: 'medium',
          createTime: Date.now(),
          projectId: pid,
          parentId: null,
          dueDate,
        });
        for (let index = 0; index < 1005; index++)
          state.tasks.push(make('跨页逾期' + index, yesterday, index % 2 ? 'doing' : 'todo'));
        const current = make('当天截止', today);
        state.tasks.push(
          current,
          make('未来截止', tomorrow),
          make('已完成旧日期', yesterday, 'done'),
          make('未设置截止', null)
        );
        state.tasks.push({
          ...current,
          id: genId(),
          title: '不参与逾期的子任务',
          parentId: current.id,
          dueDate: null,
        });
        state.tasks.push(make('第二项目逾期', yesterday, 'todo', secondProject.id));
        return state;
      }).ok,
      true
    );
    {
      const snapshotBefore = memory.get(DATA_KEY);
      const writesBefore = writes;
      const pages = [];
      request.defaults.adapter = async (config) => {
        if (config.method === 'get' && config.url === '/tasks') {
          pages.push(config.params.page);
          assert.equal(config.params.projectId, projectId);
          assert.equal(config.params.parentId, 'root');
        }
        return adapter(config);
      };
      try {
        await store.fetchAllTasks(projectId);
      } finally {
        request.defaults.adapter = adapter;
      }
      assert.deepEqual(
        pages,
        Array.from({ length: 11 }, (_, index) => index + 1)
      );
      assert.equal(store.allTasks.length, 1009, '全量汇总无1000条上限');
      assert.equal(new Set(store.allTasks.map((task) => task.id)).size, 1009);
      assert(
        store.allTasks.every((task) => task.projectId === projectId && task.parentId === null)
      );
      assert.deepEqual(store.taskSummary, { total: 1009, done: 1, percentage: 0 });
      await store.fetchAllForKanban();
      assert.equal(store.allTasks.length, 1010, '全部项目汇总排除子任务');
      const full = store.allTasks;
      for (const kind of ['empty', 'network']) {
        request.defaults.adapter = async (config) => {
          const response = await adapter(config);
          if (config.method === 'get' && config.url === '/tasks' && config.params.page === 2) {
            if (kind === 'network') throw new Error('全量查询第二页网络失败');
            return {
              ...response,
              data: { ...response.data, data: { ...response.data.data, list: [] } },
            };
          }
          return response;
        };
        try {
          await assert.rejects(
            store.fetchAllTasks(projectId),
            kind === 'empty' ? /加载不完整/ : /网络失败/
          );
        } finally {
          request.defaults.adapter = adapter;
        }
        assert.strictEqual(store.allTasks, full);
        assert.deepEqual(store.taskSummary, { total: 1010, done: 1, percentage: 0 });
        assert.equal(store.loading, false);
      }
      let releaseOld;
      let startedOld;
      const gate = new Promise((resolve) => (releaseOld = resolve));
      const started = new Promise((resolve) => (startedOld = resolve));
      request.defaults.adapter = async (config) => {
        const response = await adapter(config);
        if (config.params.projectId === projectId && config.params.page === 2) {
          startedOld();
          await gate;
        }
        return response;
      };
      const old = store.fetchAllTasks(projectId);
      try {
        await started;
        await store.fetchAllForKanban(secondProject.id);
      } finally {
        releaseOld();
        await old;
        request.defaults.adapter = adapter;
      }
      assert.deepEqual(store.taskSummary, { total: 1, done: 0, percentage: 0 });
      assert(store.allTasks.every((task) => task.projectId === secondProject.id));
      assert.equal(store.loading, false);
      assert.equal(memory.get(DATA_KEY), snapshotBefore);
      assert.equal(writes, writesBefore, '全量加载、失败与旧响应均不得写入存储');
      console.log(
        'PASS: 1009条顶层任务跨11页无上限，全部项目1010条且排除子任务；空页/网络失败保留缓存，旧项目响应不能覆盖新项目，查询零写入'
      );
    }
    const params = Object.freeze({ overdue: true, projectId, page: 1, pageSize: 100 });
    let page = 1;
    const list = [];
    do {
      const res = await getTaskList({ ...params, page });
      assert.equal(res.total, 1005);
      list.push(...res.list);
      page++;
    } while (list.length < 1005);
    assert.equal(page, 12);
    assert.equal(new Set(list.map((item) => item.id)).size, 1005);
    assert(list.every((item) => isOverdue(item, today) && item.projectId === projectId));
    assert.equal((await request.get('/tasks', { params: { overdue: 'true' } })).total, 1006);
    const combined = await getTaskList({
      overdue: true,
      projectId,
      keyword: '跨页逾期',
      status: 'doing',
      page: 2,
      pageSize: 7,
    });
    assert.equal(combined.total, 502);
    assert.equal(combined.list.length, 7);
    assert(combined.list.every((item) => item.status === 'doing'));
    for (const value of ['', 'yes', 1, null, [], {}])
      await assert.rejects(getTaskList({ overdue: value }), /查询参数/);
    for (const value of [true, null, [], {}, 0, -1, '1.5', '9007199254740992']) {
      await assert.rejects(getTaskList({ page: value }), /查询参数/);
      await assert.rejects(getTaskList({ pageSize: value }), /查询参数/);
    }
    for (const status of [0, false, null, [], {}])
      await assert.rejects(getTaskList({ status }), /查询参数/);
    assert.equal((await getTaskList({ overdue: false, projectId })).total, 1009);
    assert.equal((await getTaskList({ overdue: 'false', projectId })).total, 1009);
    assert.equal(params.page, 1);
    await store.setProjectId(projectId);
    await store.setPage(5);
    await store.setOverdue(true);
    assert.equal(store.query.page, 1);
    assert.equal(store.total, 1005);
    await store.setStatus('doing');
    await store.setKeyword('跨页逾期');
    await store.setOverdue(false);
    assert.equal(store.query.status, 'doing');
    assert.equal(store.query.keyword, '跨页逾期');
    assert.equal(store.query.projectId, projectId);
    await store.setStatus('');
    await store.setKeyword('');
    let release;
    let enter;
    const gate = new Promise((resolve) => (release = resolve));
    const entered = new Promise((resolve) => (enter = resolve));
    request.defaults.adapter = async (config) => {
      const response = await adapter(config);
      if (config.params.overdue === true) {
        enter();
        await gate;
      }
      return response;
    };
    const old = store.setOverdue(true);
    await entered;
    await store.setOverdue(false);
    release();
    await old;
    assert.equal(store.query.overdue, false);
    assert.equal(store.total, 1009);
    request.defaults.adapter = adapter;
    store.clearTasks();
    assert.equal(store.query.overdue, false);
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    console.log(
      'PASS: 1005条逾期跨11页完整查询，组合筛选/空条件/参数校验、项目及状态保持、回第一页、旧响应隔离与退出筛选复位'
    );
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
