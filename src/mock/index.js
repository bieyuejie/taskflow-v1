import MockAdapter from 'axios-mock-adapter';
import request from '../api/request';

const mock = new MockAdapter(request);

mock.onPost('/api/login').reply((config) => {
  const body = parseBody(config);
  if (
    !body ||
    typeof body.username !== 'string' ||
    !body.username.trim() ||
    typeof body.password !== 'string' ||
    !body.password.trim()
  ) {
    return [200, { code: 400, data: null, msg: '账号和密码不能为空' }];
  }
  return [
    200,
    { code: 200, data: { token: 'fake-xxx', username: body.username.trim() }, msg: 'ok' },
  ];
});

function parseBody(config) {
  try {
    return JSON.parse(config.data || '{}');
  } catch {
    return null;
  }
}

function authorize(config) {
  if (config.headers?.Authorization !== 'fake-xxx') {
    return [200, { code: 401, data: null, msg: '登录已失效，请重新登录' }];
  }
  return null;
}

function validTask(task) {
  return (
    task &&
    typeof task.title === 'string' &&
    task.title.trim() &&
    typeof task.desc === 'string' &&
    ['todo', 'doing', 'done'].includes(task.status) &&
    ['low', 'medium', 'high'].includes(task.priority)
  );
}

let lastId = Date.now();

const tasks = [
  {
    id: String(++lastId),
    title: '学习Vue3',
    desc: '组合式API',
    status: 'todo',
    priority: 'high',
    createTime: Date.now(),
  },
  {
    id: String(++lastId),
    title: '写登录页',
    desc: '表单校验',
    status: 'doing',
    priority: 'medium',
    createTime: Date.now(),
  },
  {
    id: String(++lastId),
    title: '部署项目',
    desc: 'Vercel',
    status: 'done',
    priority: 'low',
    createTime: Date.now(),
  },
];

mock.onGet('/api/tasks').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const { keyword = '', status = '', page = 1, pageSize = 10 } = config.params || {};
  if (
    typeof keyword !== 'string' ||
    (status && !['todo', 'doing', 'done'].includes(status)) ||
    !Number.isInteger(Number(page)) ||
    Number(page) < 1 ||
    !Number.isInteger(Number(pageSize)) ||
    Number(pageSize) < 1
  ) {
    return [200, { code: 400, data: null, msg: '查询参数不合法' }];
  }
  const list = tasks.filter(
    (task) => task.title.includes(keyword) && (status ? task.status === status : true)
  );
  const total = list.length;
  const start = (page - 1) * pageSize;
  const data = list.slice(start, start + Number(pageSize));
  return [200, { code: 200, data: { list: data, total }, msg: 'ok' }];
});

mock.onPost('/api/tasks').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const body = parseBody(config);
  if (!validTask(body)) return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  const createTime = Date.now();
  lastId = Math.max(createTime, lastId + 1);
  const task = {
    id: String(lastId),
    title: body.title.trim(),
    desc: body.desc,
    status: body.status,
    priority: body.priority,
    createTime,
  };
  tasks.unshift(task);
  return [200, { code: 200, data: task, msg: '新增成功' }];
});

mock.onPut(/^\/api\/tasks\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const id = config.url.split('/').pop();
  const body = parseBody(config);
  if (!body) return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return [200, { code: 400, data: null, msg: '任务不存在' }];

  const currentTask = tasks[index];
  if (!validTask({ ...currentTask, ...body })) {
    return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  }
  tasks[index] = {
    ...currentTask,
    title: (body.title ?? currentTask.title).trim(),
    desc: body.desc ?? currentTask.desc,
    status: body.status ?? currentTask.status,
    priority: body.priority ?? currentTask.priority,
  };
  return [200, { code: 200, data: tasks[index], msg: '编辑成功' }];
});

mock.onDelete(/^\/api\/tasks\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const id = config.url.split('/').pop();
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return [200, { code: 400, data: null, msg: '任务不存在' }];

  tasks.splice(index, 1);
  return [200, { code: 200, data: null, msg: '删除成功' }];
});

mock.onAny().reply(200, { code: 400, data: null, msg: '接口不存在' });
