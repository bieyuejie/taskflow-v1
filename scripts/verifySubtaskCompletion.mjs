import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { createServer } from 'vite';

export async function verifySubtaskCompletion() {
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
          writes += 1;
          if (failWrites) throw new Error('模拟子任务状态写入失败');
        }
        memory.set(key, String(value));
      },
      removeItem: (key) => memory.delete(key),
    },
  });

  try {
    server = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false,
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom',
    });
    await server.ssrLoadModule('/src/mock/index.js');
    ({ default: request } = await server.ssrLoadModule('/src/api/request.js'));
    adapter = request.defaults.adapter;
    const { getState, initRepository } = await server.ssrLoadModule('/src/mock/repository.js');
    const { TOKEN_KEY, DATA_KEY, DEMO_TOKEN } = await server.ssrLoadModule('/src/utils/storage.js');
    const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
    memory.set(TOKEN_KEY, DEMO_TOKEN);
    setActivePinia(createPinia());
    const store = useTaskStore();
    const [parent, other] = getState().tasks;
    const draft = { desc: '', projectId: parent.projectId, priority: parent.priority };
    const first = await store.addSubtask(parent.id, { ...draft, title: '勾选子任务一' });
    const second = await store.addSubtask(parent.id, { ...draft, title: '勾选子任务二' });
    const find = (id) => getState().tasks.find((task) => task.id === id);
    const otherBefore = find(other.id);

    let beforeWrites = writes;
    await store.setSubtaskCompleted(parent.id, first.id, true);
    assert.equal(writes - beforeWrites, 1);
    assert.equal(find(first.id).status, 'done');
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 2, done: 1, percentage: 50 });
    await store.setSubtaskCompleted(parent.id, second.id, true);
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 2, done: 2, percentage: 100 });
    assert.equal(find(parent.id).status, 'todo', '子任务全完成不能自动完成父任务');
    assert.equal(store.total, 3, '子任务不得计入顶层任务总数');
    console.log(
      'PASS: 子任务完成只写一次，进度50%/100%准确，全部完成不自动完成父任务且顶层总数不变'
    );

    await request.put(`/tasks/${parent.id}`, { status: 'done' });
    await store.fetchTasks();
    const beforeState = getState();
    const beforeRaw = memory.get(DATA_KEY);
    const beforeCache = structuredClone(
      store.subtasksByParent[parent.id].map((task) => ({ ...task }))
    );
    const beforeList = store.taskList.map((task) => ({ ...task }));
    beforeWrites = writes;
    failWrites = true;
    await assert.rejects(store.setSubtaskCompleted(parent.id, first.id, false), /存储写入失败/);
    assert.equal(writes - beforeWrites, 1);
    assert.deepEqual(getState(), beforeState);
    assert.equal(memory.get(DATA_KEY), beforeRaw);
    assert.deepEqual(store.subtasksByParent[parent.id], beforeCache);
    assert.deepEqual(store.taskList, beforeList);
    failWrites = false;
    beforeWrites = writes;
    await store.setSubtaskCompleted(parent.id, first.id, false);
    assert.equal(writes - beforeWrites, 1);
    assert.equal(find(first.id).status, 'todo');
    assert.equal(find(parent.id).status, 'doing');
    assert.equal(store.taskList.find((task) => task.id === parent.id).status, 'doing');
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 2, done: 1, percentage: 50 });
    assert.equal(find(first.id).id, first.id);
    assert.equal(find(first.id).createTime, first.createTime);
    assert.deepEqual(find(other.id), otherBefore);
    console.log(
      'PASS: 重新打开时父子原子改为doing/todo，写失败内存/存储/Store保留，重试单次写入且其他任务不变'
    );

    const valid = getState();
    const raw = memory.get(DATA_KEY);
    beforeWrites = writes;
    await assert.rejects(request.put(`/tasks/${parent.id}`, { status: 'done' }), /未完成子任务/);
    await assert.rejects(request.put(`/tasks/${first.id}`, { status: 'doing' }), /todo\/done/);
    await assert.rejects(store.setSubtaskCompleted(other.id, first.id, true), /父子关系不可修改/);
    assert.equal(writes, beforeWrites);
    assert.deepEqual(getState(), valid);
    assert.equal(memory.get(DATA_KEY), raw);
    console.log('PASS: 未完成子任务阻止父任务完成，子任务doing及错误父ID拒绝，非法请求不写入');

    request.defaults.adapter = (config) => {
      if (config.method === 'get' && config.url === '/tasks') {
        throw new Error('模拟保存后查询失败');
      }
      return adapter(config);
    };
    beforeWrites = writes;
    const saved = await store.setSubtaskCompleted(parent.id, first.id, true);
    assert.equal(saved.status, 'done', '已保存成功不能因后续刷新失败而报告保存失败');
    assert.equal(writes - beforeWrites, 1);
    assert.equal(find(first.id).status, 'done');
    assert.equal(find(parent.id).status, 'doing');
    assert.match(store.subtaskErrors[parent.id], /保存后查询失败/);
    assert.match(store.listError, /保存后查询失败/);
    assert.equal(store.subtaskLoading[parent.id], false);
    request.defaults.adapter = adapter;
    beforeWrites = writes;
    await Promise.all([store.fetchSubtasks(parent.id), store.fetchTasks()]);
    assert.equal(writes, beforeWrites, '刷新重试只能查询，不再次提交写操作');
    assert.equal(store.subtaskErrors[parent.id], '');
    assert.equal(store.listError, '');
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 2, done: 2, percentage: 100 });
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    console.log('PASS: 保存成功与刷新失败分别处理，错误可重试查询且不重复写入，重新读取快照一致');
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
