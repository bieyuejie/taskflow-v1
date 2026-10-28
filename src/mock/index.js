import MockAdapter from 'axios-mock-adapter';
import request from '../api/request';
import { DEMO_TOKEN } from '../utils/storage';
import {
  initRepository,
  getState,
  saveSnapshot,
  getRepositoryStatus,
  resetRepository,
} from './repository';
import { genId } from '../utils/id';

initRepository();
const mock = new MockAdapter(request);

const statusReply = (result) => [
  200,
  { code: result.ok ? 200 : 400, data: getRepositoryStatus(), msg: result.reason || 'ok' },
];
mock
  .onGet('/storage/status')
  .reply(() => [200, { code: 200, data: getRepositoryStatus(), msg: 'ok' }]);
mock.onPost('/storage/retry').reply(() => statusReply(initRepository()));
mock
  .onPost('/storage/reset')
  .reply((config) => statusReply(resetRepository(parseBody(config)?.confirmed)));

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
    { code: 200, data: { token: DEMO_TOKEN, username: body.username.trim() }, msg: 'ok' },
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
  if (config.headers?.Authorization !== DEMO_TOKEN) {
    return [200, { code: 401, data: null, msg: '登录已失效，请重新登录' }];
  }
  const status = getRepositoryStatus();
  if (!status.ok) return [200, { code: 400, data: null, msg: status.reason }];
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

mock.onGet('/tasks').reply((config) => {
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
  const all = getState().tasks.filter((t) => t.parentId === null);
  const list = all.filter(
    (t) => t.title.includes(keyword) && (status ? t.status === status : true)
  );
  const start = (page - 1) * pageSize;
  return [
    200,
    {
      code: 200,
      data: { list: list.slice(start, start + Number(pageSize)), total: list.length },
      msg: 'ok',
    },
  ];
});

mock.onPost('/tasks').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const body = parseBody(config);
  if (!validTask(body)) return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  let newTask;
  const result = saveSnapshot((state) => {
    newTask = {
      id: genId(),
      title: body.title.trim(),
      desc: body.desc,
      status: body.status,
      priority: body.priority,
      createTime: Date.now(),
      projectId: state.projects[0].id, // 第三阶段再接入项目选择。
      parentId: null,
      dueDate: null,
    };
    state.tasks.unshift(newTask);
    return state;
  });
  if (!result.ok) return [200, { code: 400, data: null, msg: result.reason }];
  return [200, { code: 200, data: newTask, msg: '新增成功' }];
});

mock.onPut(/^\/api\/tasks\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const id = config.url.split('/').pop();
  const body = parseBody(config);
  if (!body) return [200, { code: 400, data: null, msg: '任务字段不合法' }];

  const current = getState().tasks.find((t) => t.id === id);
  if (!current) return [200, { code: 400, data: null, msg: '任务不存在' }];

  if (!validTask({ ...current, ...body })) {
    return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  }

  let updated;
  const result = saveSnapshot((state) => {
    const index = state.tasks.findIndex((t) => t.id === id);
    updated = {
      ...state.tasks[index],
      title: (body.title ?? current.title).trim(),
      desc: body.desc ?? current.desc,
      status: body.status ?? current.status,
      priority: body.priority ?? current.priority,
    };
    state.tasks[index] = updated;
    return state;
  });

  if (!result.ok) return [200, { code: 400, data: null, msg: result.reason }];
  return [200, { code: 200, data: updated, msg: '编辑成功' }];
});

mock.onDelete(/^\/api\/tasks\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const id = config.url.split('/').pop();

  if (!getState().tasks.find((t) => t.id === id)) {
    return [200, { code: 400, data: null, msg: '任务不存在' }];
  }

  const result = saveSnapshot((state) => {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    return state;
  });

  if (!result.ok) return [200, { code: 400, data: null, msg: result.reason }];
  return [200, { code: 200, data: null, msg: '删除成功' }];
});

mock.onAny().reply(200, { code: 400, data: null, msg: '接口不存在' });
