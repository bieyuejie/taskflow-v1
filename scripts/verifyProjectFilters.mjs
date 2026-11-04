import assert from 'node:assert/strict';
import axios from 'axios';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { createServer } from 'vite';

export async function verifyProjectFilters() {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousMessage = ElMessage.error;
  const memory = new Map();
  let failTokenRead = false;
  let server;
  let request;
  let adapter;
  ElMessage.error = () => {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        if (failTokenRead && key === 'taskflow_v1_token') throw new Error('read denied');
        return memory.get(key) ?? null;
      },
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
  });

  try {
    server = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false,
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom',
      plugins: [
        {
          name: 'verify-router-without-browser',
          enforce: 'pre',
          load(id) {
            // Node 中仅替换浏览器路由副作用，实际跳转由浏览器脚本验证。
            if (id.replaceAll('\\', '/').endsWith('/src/router/index.js')) {
              return 'export default { replace: async () => {} };';
            }
          },
        },
      ],
    });
    await server.ssrLoadModule('/src/mock/index.js');
    ({ default: request } = await server.ssrLoadModule('/src/api/request.js'));
    adapter = request.defaults.adapter;
    const { useProjectStore } = await server.ssrLoadModule('/src/stores/project.js');
    const { useTaskStore } = await server.ssrLoadModule('/src/stores/task.js');
    const { useUserStore } = await server.ssrLoadModule('/src/stores/user.js');
    const { getState, saveSnapshot } = await server.ssrLoadModule('/src/mock/repository.js');
    const { genId } = await server.ssrLoadModule('/src/utils/id.js');
    setActivePinia(createPinia());
    const user = useUserStore();
    await user.login({ username: 'filter-assert', password: 'demo' });
    const projects = useProjectStore();
    const tasks = useTaskStore();
    await projects.fetchProjects();
    const firstId = projects.projects[0].id;
    const second = await projects.addProject({ name: '筛选目标项目', desc: '' });
    await tasks.fetchAllTasks(second.id);
    assert.deepEqual(
      tasks.taskSummary,
      { total: 0, done: 0, percentage: 0 },
      '新建空项目应显示0条任务，0条完成，0完成率'
    );
    assert.equal(
      saveSnapshot((state) => {
        const base = state.tasks[0];
        state.tasks.push({ ...base, id: genId(), title: '目标项目任务', projectId: second.id });
        return state;
      }).ok,
      true
    );
    await tasks.fetchAllTasks(firstId);
    assert.deepEqual(
      tasks.taskSummary,
      { total: 3, done: 1, percentage: 33 },
      '默认项目只统计自身的3条任务'
    );

    await tasks.fetchAllForKanban(second.id);
    assert.deepEqual(
      tasks.taskSummary,
      { total: 1, done: 0, percentage: 0 },
      '切换项目后，只统计目标项目的1条任务'
    );
    assert(
      tasks.allTasks.every((task) => task.projectId === second.id),
      '看板数据不能混入其他项目的任务'
    );
    console.log('PASS: 默认项目与目标项目汇总分别为3/1/33%和1/0/0%，看板任务归属隔离');

    const summaryTaskId = tasks.allTasks[0].id;
    await tasks.updateStatus(summaryTaskId, 'done');
    assert.deepEqual(
      tasks.taskSummary,
      { total: 1, done: 1, percentage: 100 },
      '项目全部任务完成时，完成率应为100%'
    );

    await tasks.updateStatus(summaryTaskId, 'todo');
    const raw = axios.create({
      baseURL: '/api',
      adapter,
      headers: { Authorization: user.token },
    });
    const draft = {
      title: '项目归属验证',
      desc: '',
      status: 'todo',
      priority: 'low',
      projectId: second.id,
    };
    const beforeCreate = memory.get('taskflow_v1_data');
    for (const projectId of [undefined, null, 123, '', '9999999999999999']) {
      assert.equal((await raw.post('/tasks', { ...draft, projectId })).data.code, 400);
      assert.equal(memory.get('taskflow_v1_data'), beforeCreate);
      assert.deepEqual(getState(), JSON.parse(beforeCreate));
    }
    const created = (await raw.post('/tasks', draft)).data;
    assert.equal(created.code, 200);
    assert.equal(created.data.projectId, second.id, '新增不能固定归入第一个项目');
    assert.equal(created.data.parentId, null);
    assert.equal(created.data.dueDate, null);
    const valid = memory.get('taskflow_v1_data');
    for (const projectId of [firstId, null, '9999999999999999']) {
      assert.equal((await raw.put(`/tasks/${created.data.id}`, { projectId })).data.code, 400);
      assert.equal(memory.get('taskflow_v1_data'), valid);
      assert.deepEqual(getState(), JSON.parse(valid));
    }
    const edited = (
      await raw.put(`/tasks/${created.data.id}`, {
        title: '编辑保留项目',
        projectId: second.id,
      })
    ).data;
    assert.equal(edited.code, 200);
    assert.equal(edited.data.id, created.data.id);
    assert.equal(edited.data.createTime, created.data.createTime);
    assert.equal(edited.data.projectId, second.id);
    assert.equal((await raw.delete(`/tasks/${created.data.id}`)).data.code, 200);
    console.log('PASS: 新增使用所选项目，缺失/非法/不存在项目拒绝，编辑保留项目且拒绝跨项目修改');
    let changingProject;
    for (const kind of ['create', 'edit', 'delete']) {
      let releaseProject;
      let enteredProject;
      const gate = new Promise((resolve) => (releaseProject = resolve));
      const started = new Promise((resolve) => (enteredProject = resolve));
      request.defaults.adapter = async (config) => {
        const response = await adapter(config);
        if (config.method === 'get' && config.url === '/projects') {
          enteredProject();
          await gate;
        }
        return response;
      };
      const pending = projects.fetchProjects();
      await started;
      try {
        if (kind === 'create')
          changingProject = await projects.addProject({ name: '并发项目', desc: '' });
        if (kind === 'edit')
          await projects.editProject(changingProject.id, { name: '并发项目已编辑', desc: '更新' });
        if (kind === 'delete') {
          projects.setCurrentProject(changingProject.id);
          await projects.removeProject(changingProject.id);
        }
      } finally {
        releaseProject();
        await pending;
        request.defaults.adapter = adapter;
      }
      const current = projects.projects.find((project) => project.id === changingProject.id);
      if (kind === 'create') assert(current, '旧项目查询不能覆盖刚新增的项目');
      if (kind === 'edit') assert.equal(current.name, '并发项目已编辑');
      if (kind === 'delete') assert.equal(current, undefined);
      if (kind === 'delete') assert.equal(projects.currentProjectId, '');
      assert.equal(projects.loading, false);
    }
    console.log('PASS: 项目旧查询不能覆盖新增/编辑/删除后的有效列表');
    const original = memory.get('taskflow_v1_data');
    await tasks.setProjectId(firstId);
    const lastList = JSON.stringify(tasks.taskList);
    const lastTotal = tasks.total;
    failTokenRead = true;
    await assert.rejects(tasks.setProjectId(second.id), /无法读取浏览器存储/);
    assert(tasks.listError.includes('无法读取浏览器存储'));
    assert.equal(JSON.stringify(tasks.taskList), lastList, '失败时保留最近有效列表供内部使用');
    assert.equal(tasks.total, lastTotal);
    failTokenRead = false;
    await tasks.fetchTasks();
    assert.equal(tasks.listError, '');
    assert.equal(tasks.total, 1);
    assert.equal(tasks.taskList[0].projectId, second.id);
    console.log('PASS: 项目查询失败记录错误，重试清除错误并返回正确项目任务');

    let release;
    let entered;
    const gate = new Promise((resolve) => (release = resolve));
    const started = new Promise((resolve) => (entered = resolve));
    request.defaults.adapter = async (config) => {
      if (config.params.projectId === firstId) {
        entered();
        await gate;
        throw new Error('旧项目查询失败');
      }
      return adapter(config);
    };
    const oldResult = tasks.setProjectId(firstId).catch((error) => error);
    await started;
    try {
      await tasks.setProjectId(second.id);
    } finally {
      release();
      assert.match((await oldResult).message, /旧项目查询失败/);
    }
    assert.equal(tasks.listError, '', '旧请求失败不得覆盖新查询的错误状态');
    assert.equal(tasks.taskList[0].projectId, second.id);
    request.defaults.adapter = adapter;

    for (const kind of ['business', 'http']) {
      await user.login({ username: 'filter-assert', password: 'demo' });
      projects.setCurrentProject(second.id);
      await tasks.setProjectId(second.id);
      await tasks.setOverdue(true);
      if (kind === 'business') {
        memory.set('taskflow_v1_token', 'invalid-token');
      } else {
        request.defaults.adapter = async () => {
          const error = new Error('HTTP 401');
          error.response = { status: 401, data: { msg: '登录失效' } };
          throw error;
        };
      }
      await assert.rejects(request.get('/tasks'));
      request.defaults.adapter = adapter;
      assert.equal(projects.currentProjectId, '');
      assert.equal(tasks.query.projectId, '');
      assert.equal(tasks.query.overdue, false);
      assert.equal(tasks.listError, '');
      assert.equal(tasks.taskList.length, 0);
      assert.equal(user.token, '');
      assert.equal(memory.get('taskflow_v1_token'), undefined);
      assert.equal(memory.get('taskflow_v1_data'), original);
      assert.deepEqual(getState(), JSON.parse(original));
    }
    console.log('PASS: 旧查询错误隔离，业务及HTTP 401清理项目与任务筛选并保留业务数据');
  } finally {
    if (request && adapter) request.defaults.adapter = adapter;
    await server?.close();
    ElMessage.error = previousMessage;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
}
