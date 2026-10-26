import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { createServer } from 'vite';

assert.equal(Number(process.versions.node.split('.')[0]), 24, '本项目使用 Node 24.x');

// 仅在此 Node 进程模拟浏览器存储，绝不读取用户浏览器或磁盘上的任务数据。
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  },
});

let server;
let request;
let originalAdapter;
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

try {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  await server.ssrLoadModule('/src/mock/index.js');
  ({ default: request } = await server.ssrLoadModule('/src/api/request.js'));
  originalAdapter = request.defaults.adapter;

  // 原始客户端验证 Mock 业务错误，避免 Node 环境调用页面消息和路由。
  const raw = axios.create({ baseURL: '/api', adapter: originalAdapter });
  assert.equal((await raw.get('/tasks')).data.code, 401);
  assert.equal((await raw.post('/login', { username: ' ', password: ' ' })).data.code, 400);
  const login = (await raw.post('/login', { username: ' stage1 ', password: 'demo' })).data;
  assert.equal(login.code, 200);
  assert.equal(login.data.username, 'stage1');
  assert.equal(typeof login.data.token, 'string');
  raw.defaults.headers.common.Authorization = login.data.token;
  // 基线仍使用旧登录键；第二阶段切换 V1 常量时同步扩展此处及存储异常断言。
  memory.set('taskflow_token', login.data.token);
  console.log('PASS: Mock 未授权、空白登录校验及演示登录');

  const invalidTask = { title: 'invalid', desc: '', status: 'unknown', priority: 'low' };
  assert.equal((await raw.post('/tasks', invalidTask)).data.code, 400);
  assert.equal((await raw.get('/tasks', { params: { page: 0 } })).data.code, 400);
  assert.equal((await raw.get('/tasks', { params: { pageSize: -1 } })).data.code, 400);
  assert.deepEqual((await raw.get('/unknown')).data, {
    code: 400,
    data: null,
    msg: '接口不存在',
  });
  console.log('PASS: 非法枚举、分页参数及未知接口');

  const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
  setActivePinia(createPinia());
  const store = useTaskStore();
  await store.fetchTasks();
  assert.equal(store.total, 3);
  const draft = { title: '阶段一断言', desc: 'memory only', status: 'todo', priority: 'high' };
  await Promise.all(Array.from({ length: 102 }, () => request.post('/tasks', draft)));
  await store.fetchTasks();
  assert.equal(store.total, 105);
  assert.equal(store.taskList.length, 10);
  await store.fetchAllTasks();
  assert.equal(store.allTasks.length, 105);
  assert.equal(store.taskList.length, 10, '全量读取不覆盖分页列表');
  assert.equal(new Set(store.allTasks.map((task) => task.id)).size, 105);
  assert.equal(
    store.statusCounts.reduce((sum, item) => sum + item.value, 0),
    105
  );
  assert.equal(
    store.priorityCounts.reduce((sum, count) => sum + count, 0),
    105
  );
  console.log('PASS: 105 条跨页读取、列表隔离、唯一 ID 与统计计数');

  const id = store.allTasks[0].id;
  const createdAt = store.allTasks[0].createTime;
  await store.updateStatus(id, 'done');
  assert.equal(store.allTasks.find((task) => task.id === id).status, 'done');
  await store.editTask(id, { ...draft, title: '已编辑', status: 'done' });
  await store.setKeyword('已编辑');
  assert.equal(store.total, 1);
  assert.equal(store.taskList[0].createTime, createdAt);
  await store.setStatus('todo');
  assert.equal(store.total, 0);
  await store.setStatus('done');
  assert.equal(store.total, 1);
  await store.removeTask(id);
  assert.equal(store.total, 0);
  await store.setStatus('');
  console.log('PASS: 新增、编辑、搜索、状态筛选、删除及看板状态同步');

  const reached = deferred();
  const release = deferred();
  request.defaults.adapter = async (config) => {
    const response = await originalAdapter(config);
    if (config.params?.keyword === '学习') {
      reached.resolve();
      await release.promise;
    }
    return response;
  };
  const older = store.setKeyword('学习');
  await reached.promise;
  try {
    await store.setKeyword('写登录');
  } finally {
    release.resolve();
    await older;
  }
  assert.equal(store.taskList[0].title, '写登录页', '旧响应不能覆盖新查询');
  request.defaults.adapter = originalAdapter;
  const pending = store.fetchTasks();
  store.clearTasks();
  await pending;
  assert.equal(store.taskList.length, 0);
  assert.equal(store.allTasks.length, 0);
  assert.equal(store.total, 0);
  assert.equal(store.loading, false);
  console.log('PASS: 乱序响应保护与清空后旧请求隔离');
  console.log('阶段一基线断言通过；V1 持久化和关联异常断言将在对应阶段补齐。');
} finally {
  if (request && originalAdapter) request.defaults.adapter = originalAdapter;
  await server?.close();
  memory.clear();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
