import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { createServer } from 'vite';

export async function verifySubtaskEdits() {
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
          if (failWrites) throw new Error('模拟子任务编辑写入失败');
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
    const child = await store.addSubtask(parent.id, {
      title: '编辑前',
      desc: '原描述',
      projectId: parent.projectId,
      priority: parent.priority,
    });
    const find = () => getState().tasks.find((task) => task.id === child.id);
    const unrelated = getState().tasks.filter((task) => task.id !== child.id);
    const originalFields = { ...child };
    delete originalFields.title;
    delete originalFields.desc;
    const draft = Object.freeze({
      title: '  编辑后  ',
      desc: '新描述',
      id: other.id,
      createTime: 0,
      parentId: other.id,
      projectId: '不存在的项目',
      status: 'done',
      priority: 'low',
      dueDate: '2030-01-01',
    });
    let beforeWrites = writes;
    const edited = await store.editSubtask(parent.id, child.id, draft);
    assert.equal(writes - beforeWrites, 1);
    assert.equal(edited.title, '编辑后');
    assert.equal(edited.desc, draft.desc);
    const fields = { ...find() };
    delete fields.title;
    delete fields.desc;
    assert.deepEqual(fields, originalFields, '编辑action只提交标题/描述及原父ID');
    assert.equal(draft.title, '  编辑后  ', '不能修改调用方草稿');
    assert.deepEqual(
      getState().tasks.filter((task) => task.id !== child.id),
      unrelated
    );
    assert.deepEqual(store.subtasksByParent[parent.id][0], edited);
    assert.deepEqual(store.subtaskProgress(parent.id), { total: 1, done: 0, percentage: 0 });
    assert.equal(store.total, 3);
    console.log(
      'PASS: 子任务编辑只改标题/描述，trim后单次保存，其他字段及任务/进度/顶层数量不变，调用方草稿不变'
    );

    for (const data of [
      { title: '   ', desc: '' },
      { title: '字'.repeat(101), desc: '' },
      { title: '合法标题', desc: '字'.repeat(2001) },
      { title: '合法标题', desc: 123 },
    ]) {
      const before = getState();
      const raw = memory.get(DATA_KEY);
      beforeWrites = writes;
      await assert.rejects(store.editSubtask(parent.id, child.id, data));
      assert.equal(writes, beforeWrites);
      assert.deepEqual(getState(), before);
      assert.equal(memory.get(DATA_KEY), raw);
    }
    beforeWrites = writes;
    await assert.rejects(
      store.editSubtask(other.id, child.id, { title: '错误父ID', desc: '' }),
      /父子关系/
    );
    assert.equal(writes, beforeWrites);
    console.log('PASS: 空白/超长标题、超长/非法描述及错误父ID拒绝，校验失败不写入');

    const before = getState();
    const raw = memory.get(DATA_KEY);
    const cache = JSON.stringify(store.subtasksByParent);
    const retryDraft = Object.freeze({ title: '失败后重试', desc: '保留描述' });
    beforeWrites = writes;
    failWrites = true;
    await assert.rejects(store.editSubtask(parent.id, child.id, retryDraft), /存储写入失败/);
    assert.equal(writes - beforeWrites, 1);
    assert.deepEqual(getState(), before);
    assert.equal(memory.get(DATA_KEY), raw);
    assert.equal(JSON.stringify(store.subtasksByParent), cache);
    failWrites = false;
    beforeWrites = writes;
    await store.editSubtask(parent.id, child.id, retryDraft);
    assert.equal(writes - beforeWrites, 1);
    assert.equal(find().title, retryDraft.title);
    assert.equal(getState().tasks.filter((task) => task.parentId === parent.id).length, 1);
    console.log('PASS: 编辑写失败保留有效内存/存储/缓存，恢复后重试只更新原子任务一次');

    request.defaults.adapter = (config) => {
      if (config.method === 'get' && config.params?.parentId === parent.id) {
        throw new Error('模拟编辑保存后刷新失败');
      }
      return adapter(config);
    };
    beforeWrites = writes;
    const saved = await store.editSubtask(parent.id, child.id, { title: '已保存待刷新', desc: '' });
    assert.equal(saved.title, '已保存待刷新');
    assert.equal(find().title, saved.title);
    assert.equal(writes - beforeWrites, 1);
    assert.match(store.subtaskErrors[parent.id], /刷新失败/);
    request.defaults.adapter = adapter;
    beforeWrites = writes;
    await store.fetchSubtasks(parent.id);
    assert.equal(writes, beforeWrites);
    assert.equal(store.subtaskErrors[parent.id], '');
    assert.equal(store.subtasksByParent[parent.id][0].title, saved.title);
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    console.log('PASS: 编辑保存成功与查询失败分开处理，重试只查询不重复保存，重新读取快照一致');
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
