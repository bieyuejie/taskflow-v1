import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';

async function verifyPriorityAndHierarchy() {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousMessage = ElMessage.error;
  const memory = new Map();
  let attempts = 0;
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
          attempts++;
          if (failWrites) throw new Error('专项模拟写入失败');
        }
        memory.set(key, String(value));
      },
      removeItem: (key) => memory.delete(key),
    },
  });
  try {
    server = await createServer({
      root: process.cwd(),
      configFile: false,
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom',
    });
    await server.ssrLoadModule('/src/mock/index.js');
    ({ default: request } = await server.ssrLoadModule('/src/api/request.js'));
    const { getState, initRepository } = await server.ssrLoadModule('/src/mock/repository.js');
    const { DEMO_TOKEN, TOKEN_KEY, DATA_KEY } = await server.ssrLoadModule('/src/utils/storage.js');
    memory.set(TOKEN_KEY, DEMO_TOKEN);
    adapter = request.defaults.adapter;
    const codes = [];
    request.defaults.adapter = async (config) => {
      const response = await adapter(config);
      codes.push(response.data.code);
      return response;
    };
    const [parent, other] = getState().tasks;
    const makeChild = (root, title) =>
      request.post('/tasks', {
        title,
        desc: '',
        status: 'todo',
        priority: 'low',
        projectId: root.projectId,
        parentId: root.id,
        dueDate: null,
      });
    const childA = await makeChild(parent, '规则检查子任务A');
    const childB = await makeChild(parent, '规则检查子任务B');
    const childOther = await makeChild(other, '其他父任务子任务');
    const extraProject = await request.post('/projects', { name: '规则检查另一项目', desc: '' });
    const extraRoot = await request.post('/tasks', {
      title: '其他项目父任务',
      desc: '',
      status: 'todo',
      priority: 'low',
      projectId: extraProject.id,
    });
    const extraChild = await makeChild(extraRoot, '其他项目子任务');
    const unrelatedBefore = getState().tasks.filter((task) =>
      [other.id, childOther.id, extraRoot.id, extraChild.id].includes(task.id)
    );
    const identities = getState().tasks.map(({ id, createTime, projectId, parentId }) => ({
      id,
      createTime,
      projectId,
      parentId,
    }));

    let beforeAttempts = attempts;
    const result = await request.put('/tasks/' + parent.id, { priority: 'medium' });
    assert.equal(attempts - beforeAttempts, 1, '父子更新只能写一次快照');
    assert.equal(codes.at(-1), 200);
    assert.equal(result.priority, 'medium');
    const affected = getState().tasks.filter(
      (task) => task.id === parent.id || task.parentId === parent.id
    );
    assert.equal(affected.length, 3);
    assert(affected.every((task) => task.priority === 'medium'));
    assert.deepEqual(
      getState().tasks.filter((task) =>
        [other.id, childOther.id, extraRoot.id, extraChild.id].includes(task.id)
      ),
      unrelatedBefore
    );
    assert.deepEqual(
      getState().tasks.map(({ id, createTime, projectId, parentId }) => ({
        id,
        createTime,
        projectId,
        parentId,
      })),
      identities
    );
    assert.deepEqual(JSON.parse(memory.get(DATA_KEY)), getState());
    console.log(
      'PASS: 父任务优先级同步全部子任务，只写一次，其他父任务及项目不变，ID/创建时间/关联不变'
    );

    const validBefore = getState();
    const rawBefore = memory.get(DATA_KEY);
    beforeAttempts = attempts;
    failWrites = true;
    await assert.rejects(request.put('/tasks/' + parent.id, { priority: 'low' }), /存储写入失败/);
    assert.equal(codes.at(-1), 400);
    assert.equal(attempts - beforeAttempts, 1);
    assert.deepEqual(getState(), validBefore);
    assert.equal(memory.get(DATA_KEY), rawBefore);
    failWrites = false;
    beforeAttempts = attempts;
    await request.put('/tasks/' + parent.id, { priority: 'low' });
    assert.equal(attempts - beforeAttempts, 1);
    assert(
      getState()
        .tasks.filter((task) => task.id === parent.id || task.parentId === parent.id)
        .every((task) => task.priority === 'low')
    );
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    console.log('PASS: 写失败返回400且父子内存与存储一起保留，重试一次保存，重新读取仍一致');

    const illegal = [
      [parent.id, other.id],
      [parent.id, childA.id],
      [parent.id, '9999999999999999'],
      [parent.id, 0],
      [parent.id, false],
      [parent.id, []],
      [parent.id, {}],
      [childA.id, null],
      [childA.id, other.id],
      [childA.id, childA.id],
      [childA.id, extraRoot.id],
      [childA.id, ''],
    ];
    for (const [id, parentId] of illegal) {
      const beforeState = getState();
      const beforeRaw = memory.get(DATA_KEY);
      beforeAttempts = attempts;
      await assert.rejects(request.put('/tasks/' + id, { parentId }), /父子关系不可修改/);
      assert.equal(codes.at(-1), 400);
      assert.equal(attempts, beforeAttempts);
      assert.deepEqual(getState(), beforeState);
      assert.equal(memory.get(DATA_KEY), beforeRaw);
    }
    console.log(
      'PASS: 拒绝顶层转子任务、子任务转顶层、换父节点、跨项目和非法父ID，全部400且零写入'
    );

    for (const [id, body] of [
      [parent.id, { parentId: null, desc: '允许回传原层级' }],
      [childA.id, { parentId: parent.id, desc: '允许回传原父ID' }],
      [childB.id, { desc: '允许省略parentId' }],
    ]) {
      beforeAttempts = attempts;
      const beforeTask = getState().tasks.find((task) => task.id === id);
      const edited = await request.put('/tasks/' + id, body);
      assert.equal(attempts - beforeAttempts, 1);
      assert.equal(codes.at(-1), 200);
      assert.equal(edited.parentId, beforeTask.parentId);
      assert.equal(edited.id, beforeTask.id);
      assert.equal(edited.createTime, beforeTask.createTime);
    }
    console.log('PASS: 回传原parentId或省略该字段可正常编辑，其余字段可修改且层级不变');
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    if (server) await server.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}

async function verifyCascade() {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousMessage = ElMessage.error;
  const memory = new Map();
  let attempts = 0,
    failWrites = false,
    failReads = false,
    server,
    request,
    adapter;
  ElMessage.error = () => {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        if (failReads && key === 'taskflow_v1_token') throw new Error('数量查询读取失败');
        return memory.get(key) ?? null;
      },
      setItem(key, value) {
        if (key === 'taskflow_v1_data') {
          attempts++;
          if (failWrites) throw new Error('级联写入失败');
        }
        memory.set(key, String(value));
      },
      removeItem: (key) => memory.delete(key),
    },
  });
  try {
    server = await createServer({
      root: process.cwd(),
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
    const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
    memory.set(TOKEN_KEY, DEMO_TOKEN);
    const [parent, other, empty] = getState().tasks;
    assert.equal(
      saveSnapshot((state) => {
        const project = { id: genId(), name: '级联检查独立项目', desc: '', createTime: Date.now() };
        state.projects.push(project);
        const root = { ...other, id: genId(), projectId: project.id, title: '其他项目顶层任务' };
        state.tasks.push(root);
        for (const [node, count] of [
          [parent, 1005],
          [other, 7],
          [root, 2],
        ]) {
          for (let index = 0; index < count; index++) {
            state.tasks.push({
              ...node,
              id: genId(),
              title: '级联检查子任务' + index,
              parentId: node.id,
              dueDate: null,
              status: index % 2 ? 'done' : 'todo',
            });
          }
        }
        return state;
      }).ok,
      true
    );
    setActivePinia(createPinia());
    const store = useTaskStore();
    await store.fetchTasks();
    const baseline = getState(),
      raw = memory.get(DATA_KEY),
      beforeStore = JSON.stringify({
        list: store.taskList,
        query: store.query,
        children: store.subtasksByParent,
        total: store.total,
      });
    const queries = [];
    request.defaults.adapter = (config) => {
      if (config.method === 'get') queries.push({ ...config.params });
      return adapter(config);
    };
    let before = attempts;
    assert.equal(await store.fetchSubtaskCount(parent.id), 1005);
    assert.equal(await store.fetchSubtaskCount(empty.id), 0);
    assert(queries.every((params) => params.page === 1 && params.pageSize === 1));
    assert.equal(queries.length, 2);
    assert.equal(attempts, before);
    assert.equal(
      JSON.stringify({
        list: store.taskList,
        query: store.query,
        children: store.subtasksByParent,
        total: store.total,
      }),
      beforeStore
    );
    assert.deepEqual(getState(), baseline);
    assert.equal(memory.get(DATA_KEY), raw);
    for (const id of [undefined, null, '', 'root', 123])
      await assert.rejects(store.fetchSubtaskCount(id), /具体的父任务/);
    const child = baseline.tasks.find((task) => task.parentId === parent.id);
    await assert.rejects(store.fetchSubtaskCount(child.id), /顶层任务/);
    failReads = true;
    await assert.rejects(store.fetchSubtaskCount(parent.id), /无法读取浏览器存储/);
    failReads = false;
    assert.equal(attempts, before);
    assert.deepEqual(getState(), baseline);
    request.defaults.adapter = adapter;
    console.log(
      'PASS: 1005条跨页子任务计数准确，仅查1条并读total；空计数0、非法父节点/查询失败拒绝，查询不写入不改Store'
    );
    failWrites = true;
    before = attempts;
    await assert.rejects(store.removeTask(parent.id), /存储写入失败/);
    assert.equal(attempts - before, 1);
    assert.deepEqual(getState(), baseline);
    assert.equal(memory.get(DATA_KEY), raw);
    assert.equal(
      JSON.stringify({
        list: store.taskList,
        query: store.query,
        children: store.subtasksByParent,
        total: store.total,
      }),
      beforeStore
    );
    failWrites = false;
    before = attempts;
    await store.removeTask(parent.id);
    assert.equal(attempts - before, 1);
    const expected = {
      ...baseline,
      tasks: baseline.tasks.filter((task) => task.id !== parent.id && task.parentId !== parent.id),
    };
    assert.deepEqual(getState(), expected);
    assert.deepEqual(JSON.parse(memory.get(DATA_KEY)), expected);
    assert.equal(store.total, 3);
    assert.equal(
      store.taskList.some((task) => task.id === parent.id),
      false
    );
    console.log(
      'PASS: 级联写失败父任务及1005个子任务一起保留，重试只写一次完整删除，其他父子任务及项目原值保留'
    );
    const after = getState();
    before = attempts;
    await assert.rejects(store.removeTask(parent.id), /任务不存在/);
    assert.equal(attempts, before);
    assert.deepEqual(getState(), after);
    request.defaults.adapter = (config) => {
      if (config.method === 'get' && config.url === '/tasks') throw new Error('删除后刷新失败');
      return adapter(config);
    };
    before = attempts;
    await store.removeTask(empty.id);
    assert.equal(attempts - before, 1);
    assert.equal(
      getState().tasks.some((task) => task.id === empty.id),
      false
    );
    assert.match(store.listError, /刷新失败/);
    request.defaults.adapter = adapter;
    before = attempts;
    await store.fetchTasks();
    assert.equal(attempts, before);
    assert.equal(store.listError, '');
    assert.equal(store.total, 2);
    assert.equal(initRepository().ok, true);
    assert.deepEqual(getState(), JSON.parse(memory.get(DATA_KEY)));
    console.log(
      'PASS: 重复删除零写入，删除成功与查询失败分开处理；重试只查不删，重新读取父子快照一致'
    );
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}

export async function verifyTaskRelations() {
  await verifyPriorityAndHierarchy();
  await verifyCascade();
}
