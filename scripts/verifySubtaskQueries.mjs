import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { createServer } from 'vite';

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

export async function verifySubtaskQueries() {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousMessage = ElMessage.error;
  const memory = new Map();
  let writes = 0;
  let server;
  let request;
  let adapter;
  ElMessage.error = () => {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => memory.get(key) ?? null,
      setItem(key, value) {
        writes += 1;
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
    const { getState, saveSnapshot } = await server.ssrLoadModule('/src/mock/repository.js');
    const { genId } = await server.ssrLoadModule('/src/utils/id.js');
    const { DEMO_TOKEN, TOKEN_KEY, DATA_KEY } = await server.ssrLoadModule('/src/utils/storage.js');
    const { getSubtasks } = await server.ssrLoadModule('/src/api/task.js');
    const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
    memory.set(TOKEN_KEY, DEMO_TOKEN);
    let parent;
    let other;
    let empty;
    assert.equal(
      saveSnapshot((state) => {
        [parent, other, empty] = state.tasks;
        for (const [root, total] of [
          [parent, 1005],
          [other, 2],
        ]) {
          state.tasks.push(
            ...Array.from({ length: total }, (_, index) => ({
              ...root,
              id: genId(),
              title: `${root.title}子任务${index}`,
              status: index % 2 ? 'done' : 'todo',
              parentId: root.id,
              dueDate: null,
            }))
          );
        }
        return state;
      }).ok,
      true
    );
    const original = memory.get(DATA_KEY);
    const originalWrites = writes;
    const params = Object.freeze({ parentId: other.id, page: 2, pageSize: 100 });
    const result = await getSubtasks(parent.id, params);
    assert.equal(result.total, 1005);
    assert.equal(result.list.length, 100);
    assert(result.list.every((task) => task.parentId === parent.id));
    assert.equal(params.parentId, other.id, '查询复制参数，并以明确传入的父任务为准');

    setActivePinia(createPinia());
    const store = useTaskStore();
    await store.fetchTasks();
    await store.fetchAllTasks();
    const topLevel = JSON.stringify({
      list: store.taskList,
      all: store.allTasks,
      total: store.total,
    });
    const pages = [];
    request.defaults.adapter = (config) => {
      if (config.params.parentId === parent.id) pages.push(config.params.page);
      return adapter(config);
    };
    const list = await store.fetchSubtasks(parent.id);
    assert.equal(list.length, 1005);
    assert.equal(new Set(list.map((task) => task.id)).size, 1005);
    assert.deepEqual(
      pages,
      Array.from({ length: 11 }, (_, index) => index + 1)
    );
    assert(list.every((task) => task.parentId === parent.id));
    assert.equal(store.subtaskLoading[parent.id], false);
    assert.equal(store.subtaskErrors[parent.id], '');
    request.defaults.adapter = adapter;
    await store.fetchSubtasks(other.id);
    assert.equal(store.subtasksByParent[other.id].length, 2);
    assert.equal(store.subtasksByParent[parent.id].length, 1005);
    assert.deepEqual(await store.fetchSubtasks(empty.id), []);
    assert.deepEqual(store.subtasksByParent[empty.id], []);
    assert.equal(
      JSON.stringify({ list: store.taskList, all: store.allTasks, total: store.total }),
      topLevel
    );
    console.log(
      'PASS: 子任务查询参数复制、1005条跨11页完整拉取、父任务缓存隔离、空子任务及顶层统计不变'
    );

    const cached = JSON.stringify(store.subtasksByParent[parent.id]);
    for (const fault of ['network', 'empty-page']) {
      request.defaults.adapter = async (config) => {
        if (config.params.parentId === parent.id && config.params.page === 2) {
          assert.equal(
            JSON.stringify(store.subtasksByParent[parent.id]),
            cached,
            '不能发布已拉取的部分页'
          );
          if (fault === 'network') throw new Error('第二页查询失败');
          const response = await adapter(config);
          return { ...response, data: { code: 200, data: { list: [], total: 1005 }, msg: 'ok' } };
        }
        return adapter(config);
      };
      await assert.rejects(
        store.fetchSubtasks(parent.id),
        fault === 'network' ? /第二页/ : /不完整/
      );
      assert.equal(JSON.stringify(store.subtasksByParent[parent.id]), cached);
      assert(store.subtaskErrors[parent.id]);
      assert.equal(store.subtaskLoading[parent.id], false);
      assert.equal(store.subtaskErrors[other.id], '');
      request.defaults.adapter = adapter;
      await store.fetchSubtasks(parent.id);
      assert.equal(store.subtaskErrors[parent.id], '');
    }
    for (const id of [undefined, null, '', 'root', 123]) {
      await assert.rejects(store.fetchSubtasks(id), /具体的父任务/);
    }
    const childId = store.subtasksByParent[parent.id][0].id;
    await assert.rejects(store.fetchSubtasks(childId), /顶层任务/);
    await assert.rejects(store.fetchSubtasks('9999999999999999'), /父任务/);
    console.log(
      'PASS: 分页失败和异常空页不发布部分数据、保留缓存、记录错误且可重试，非法父节点拒绝'
    );

    for (const fail of [false, true]) {
      const entered = deferred();
      const release = deferred();
      let held = false;
      request.defaults.adapter = async (config) => {
        const response = await adapter(config);
        if (config.params.parentId === parent.id && !held) {
          held = true;
          entered.resolve();
          await release.promise;
          if (fail) throw new Error('旧子任务请求失败');
          return response;
        }
        return response;
      };
      const older = store.fetchSubtasks(parent.id).catch((error) => error);
      await entered.promise;
      try {
        await store.fetchSubtasks(other.id);
        assert.equal(store.subtaskLoading[parent.id], true);
        assert.equal(store.subtaskLoading[other.id], false);
        await store.fetchSubtasks(parent.id);
      } finally {
        release.resolve();
        const obsolete = await older;
        if (fail) assert.match(obsolete.message, /旧子任务请求/);
        else assert.equal(obsolete, undefined, '过期查询应停止且不再拉取后续页');
      }
      assert.equal(store.subtasksByParent[parent.id].length, 1005);
      assert.equal(store.subtaskLoading[parent.id], false);
      assert.equal(store.subtaskErrors[parent.id], '');
      request.defaults.adapter = adapter;
    }

    const entered = [deferred(), deferred()];
    const release = [deferred(), deferred()];
    let held = 0;
    request.defaults.adapter = async (config) => {
      const response = await adapter(config);
      if (config.params.parentId === parent.id && config.params.page === 1 && held < 2) {
        const index = held++;
        entered[index].resolve();
        await release[index].promise;
      }
      return response;
    };
    const older = store.fetchSubtasks(parent.id);
    await entered[0].promise;
    const previousId = store.nextSubtaskRequestId;
    store.clearTasks();
    assert.equal(store.nextSubtaskRequestId, previousId, '清理不能重置请求编号');
    for (const map of [
      store.subtasksByParent,
      store.subtaskLoading,
      store.subtaskErrors,
      store.subtaskRequestIds,
    ]) {
      assert.deepEqual(map, {});
    }
    const newer = store.fetchSubtasks(parent.id);
    await entered[1].promise;
    try {
      assert(store.nextSubtaskRequestId > previousId);
      release[0].resolve();
      await older;
      assert.equal(store.subtaskLoading[parent.id], true, '旧请求结束不能关闭新请求的加载状态');
      assert.equal(store.subtasksByParent[parent.id], undefined, '旧响应不能在清理后回填');
    } finally {
      release[0].resolve();
      release[1].resolve();
      await newer;
    }
    assert.equal(store.subtasksByParent[parent.id].length, 1005);
    assert.equal(store.subtaskLoading[parent.id], false);
    assert.equal(memory.get(DATA_KEY), original);
    assert.equal(writes, originalWrites, '子任务查询和清理不写业务快照');
    assert.deepEqual(getState(), JSON.parse(original));
    console.log(
      'PASS: 不同父任务并发互不干扰、旧成功/失败响应隔离、清理后同父任务重查不复用编号且不回填'
    );
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
