import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { createServer } from 'vite';
import './verifyData.mjs';
import { verifyStorage } from './verifyStorage.mjs';
import { verifyProjectFilters } from './verifyProjectFilters.mjs';
import { verifySubtaskQueries } from './verifySubtaskQueries.mjs';
import { verifySubtaskCompletion } from './verifySubtaskCompletion.mjs';
import { verifySubtaskEdits } from './verifySubtaskEdits.mjs';
import { verifySubtaskDeletion } from './verifySubtaskDeletion.mjs';
import { verifyTaskRelations } from './verifyTaskRelations.mjs';
import { verifyDates } from './verifyDates.mjs';

assert.equal(Number(process.versions.node.split('.')[0]), 24, '本项目使用 Node 24.x');

// 仅在此 Node 进程模拟浏览器存储，绝不读取用户浏览器或磁盘上的任务数据。
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const memory = new Map();
let dataWrites = 0;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'taskflow_v1_data') dataWrites += 1;
      memory.set(key, String(value));
    },
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
  // 第二阶段已切换 V1 键名；后续存储异常断言在此扩展。
  memory.set('taskflow_v1_token', login.data.token);
  console.log('PASS: Mock 未授权、空白登录校验及演示登录');

  const projectId = (await raw.get('/projects')).data.data[0].id;
  const invalidTask = { title: 'invalid', desc: '', status: 'unknown', priority: 'low', projectId };
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
  const draft = {
    title: '阶段一断言',
    desc: 'memory only',
    status: 'todo',
    priority: 'high',
    projectId,
  };
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
  assert.deepEqual(
    store.taskSummary,
    { total: 105, done: 1, percentage: 1 },
    '汇总应使用全部105条顶层任务，完成率四舍五入1%'
  );
  console.log('PASS: 105 条跨页读取、列表隔离、唯一 ID 与统计计数');

  // 第二页异常为空时，不得发布第一页的100条部分数据。
  const completeTasks = store.allTasks;
  const completeTaskData = JSON.parse(JSON.stringify(completeTasks));
  const completeSummary = { ...store.taskSummary };
  const originalList = store.taskList;
  const originalTotal = store.total;
  const snapshotBeforeEmptyPage = memory.get('taskflow_v1_data');
  const writesBeforeEmptyPage = dataWrites;
  const emptyPageRequests = [];
  request.defaults.adapter = async (config) => {
    const response = await originalAdapter(config);
    if (config.method === 'get' && config.url === '/tasks') {
      emptyPageRequests.push({ page: config.params.page, projectId: config.params.projectId });
      if (config.params.page === 2) {
        assert.equal(response.data.code, 200);
        assert.equal(response.data.data.total, 105);
        assert.equal(response.data.data.list.length, 5, '先确认第二页原本有5条真实任务');
        return {
          ...response,
          data: { ...response.data, data: { ...response.data.data, list: [] } },
        };
      }
    }
    return response;
  };
  try {
    await assert.rejects(store.fetchAllTasks(projectId), /任务加载不完整，请重试/);
  } finally {
    request.defaults.adapter = originalAdapter;
  }
  assert.deepEqual(emptyPageRequests, [
    { page: 1, projectId },
    { page: 2, projectId },
  ]);
  assert.strictEqual(store.allTasks, completeTasks, '失败不替换最近有效的全量缓存');
  assert.deepEqual(store.allTasks, completeTaskData, '缓存内容保持完整且未修改');
  assert.deepEqual(store.taskSummary, completeSummary, '汇总不能降为第一页的100条');
  assert.strictEqual(store.taskList, originalList, '全量查询失败不替换分页列表');
  assert.equal(store.total, originalTotal);
  assert.equal(store.loading, false, '失败后解除加载状态，允许重试');
  assert.equal(memory.get('taskflow_v1_data'), snapshotBeforeEmptyPage);
  assert.equal(dataWrites, writesBeforeEmptyPage, '失败查询不能写入业务存储');

  await store.fetchAllForKanban(projectId);
  assert.deepEqual(store.allTasks, completeTaskData, '恢复后重试完整加载105条任务');
  assert.deepEqual(store.taskSummary, completeSummary);
  assert.equal(new Set(store.allTasks.map((task) => task.id)).size, 105, '重试不重复追加任务');
  assert.strictEqual(store.taskList, originalList);
  assert.equal(store.total, originalTotal);
  assert.equal(store.loading, false);
  assert.equal(memory.get('taskflow_v1_data'), snapshotBeforeEmptyPage);
  assert.equal(dataWrites, writesBeforeEmptyPage, '重试只查询，不产生业务写入');
  console.log(
    'PASS: 顶层任务第二页异常空页拒绝、完整缓存及汇总保留、加载锁释放，重试105条无重复且零写入'
  );

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
  assert.deepEqual(
    store.taskSummary,
    { total: 0, done: 0, percentage: 0 },
    '清空后汇总应全部为零，完成率不能是NaN'
  );
  console.log('PASS: 乱序响应保护与清空后旧请求隔离');
} finally {
  if (request && originalAdapter) request.defaults.adapter = originalAdapter;
  await server?.close();
  memory.clear();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}

await verifyStorage();
console.log('第二阶段存储与恢复断言通过。');
await verifyProjectFilters();
await verifySubtaskQueries();
await verifySubtaskCompletion();
await verifySubtaskEdits();
await verifySubtaskDeletion();
await verifyTaskRelations();
await verifyDates();
