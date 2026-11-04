import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { createServer } from 'vite';

export async function verifySubtaskDeletion() {
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
          if (failWrites) throw new Error('模拟删除子任务写入失败');
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
    const add = (root, title) =>
      store.addSubtask(root.id, {
        title,
        desc: '',
        projectId: root.projectId,
        priority: root.priority,
      });
    const target = await add(parent, '待删除子任务');
    const kept = await add(parent, '保留子任务');
    await add(other, '其他父任务的子任务');
    await store.setSubtaskCompleted(parent.id, kept.id, true);
    const unrelated = getState().tasks.filter((task) => task.id !== target.id);
    const before = getState();
    const raw = memory.get(DATA_KEY);
    const cache = JSON.stringify(store.subtasksByParent);
    let beforeWrites = writes;
    failWrites = true;
    await assert.rejects(store.removeSubtask(parent.id, target.id), /存储写入失败/);
    assert.equal(writes - beforeWrites, 1);
    assert.deepEqual(getState(), before);
    assert.equal(memory.get(DATA_KEY), raw);
    assert.equal(JSON.stringify(store.subtasksByParent), cache);
    failWrites = false;
    beforeWrites = writes;
    await store.removeSubtask(parent.id, target.id);
    assert.equal(writes - beforeWrites, 1);
    assert.deepEqual(getState().tasks, unrelated, '只删除指定子任务，父任务及其他子任务完全保留');
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 1, done: 1, percentage: 100 });
    assert.equal(store.total, 3);
    console.log(
      'PASS: 子任务删除失败保留内存/存储/缓存，重试单次写入，只删目标、进度更新且父任务和顶层数量不变'
    );

    const after = getState();
    const afterRaw = memory.get(DATA_KEY);
    beforeWrites = writes;
    await assert.rejects(store.removeSubtask(parent.id, target.id), /任务不存在/);
    assert.equal(writes, beforeWrites);
    assert.deepEqual(getState(), after);
    assert.equal(memory.get(DATA_KEY), afterRaw);
    console.log('PASS: 重复删除已不存在的子任务返回业务错误且零写入');

    request.defaults.adapter = (config) => {
      if (config.method === 'get' && config.params?.parentId === parent.id) {
        throw new Error('模拟删除成功后刷新失败');
      }
      return adapter(config);
    };
    beforeWrites = writes;
    await store.removeSubtask(parent.id, kept.id);
    assert.equal(writes - beforeWrites, 1);
    assert.equal(
      getState().tasks.some((task) => task.id === kept.id),
      false
    );
    assert.match(store.subtaskErrors[parent.id], /刷新失败/);
    assert.equal(store.subtaskLoading[parent.id], false);
    request.defaults.adapter = adapter;
    beforeWrites = writes;
    await store.fetchSubtasks(parent.id);
    assert.equal(writes, beforeWrites, '删除后的刷新重试不得再次提交删除');
    assert.equal(store.subtaskErrors[parent.id], '');
    assert.deepEqual(store.subtasksByParent[parent.id], []);
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 0, done: 0, percentage: 0 });
    assert.deepEqual(
      getState().tasks.find((task) => task.id === parent.id),
      parent
    );
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    assert.equal(
      getState().tasks.some((task) => task.parentId === parent.id),
      false
    );
    console.log(
      'PASS: 删除成功与刷新失败分开处理，查询重试不重复删除，空进度为零且重读不填充子任务'
    );
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
