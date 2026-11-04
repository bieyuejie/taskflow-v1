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
import { getLocalDate, isOverdue } from '../utils/date';

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

function validPage(value) {
  return (
    (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

mock.onGet('/projects').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;

  return [
    200,
    {
      code: 200,
      data: getState().projects,
      msg: 'ok',
    },
  ];
});

mock.onPost('/projects').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;

  const body = parseBody(config);

  if (!body || typeof body.name !== 'string' || typeof body.desc !== 'string') {
    return [200, { code: 400, data: null, msg: '项目字段不合法' }];
  }

  let project;

  const result = saveSnapshot((state) => {
    project = {
      id: genId(),
      name: body.name.trim(),
      desc: body.desc,
      createTime: Date.now(),
    };

    state.projects.push(project);
    return state;
  });

  if (!result.ok) {
    return [200, { code: 400, data: null, msg: result.reason }];
  }

  return [200, { code: 200, data: project, msg: '项目新增成功' }];
});

mock.onPut(/^\/api\/projects\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;

  const id = config.url.split('/').pop();
  const body = parseBody(config);

  if (
    !body ||
    typeof body.name !== 'string' ||
    typeof body.desc !== 'string' ||
    Object.keys(body).some((key) => !['name', 'desc'].includes(key))
  ) {
    return [200, { code: 400, data: null, msg: '只能编辑项目名称和描述' }];
  }

  let updated;

  const result = saveSnapshot((state) => {
    const project = state.projects.find((item) => item.id === id);
    if (!project) throw new Error('项目不存在');

    project.name = body.name.trim();
    project.desc = body.desc;
    updated = project;

    return state;
  });

  if (!result.ok) {
    return [200, { code: 400, data: null, msg: result.reason }];
  }

  return [200, { code: 200, data: updated, msg: '项目编辑成功' }];
});

mock.onDelete(/^\/api\/projects\/\d+$/).reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;

  const id = config.url.split('/').pop();

  const result = saveSnapshot((state) => {
    const index = state.projects.findIndex((project) => project.id === id);

    if (index === -1) {
      throw new Error('项目不存在');
    }

    if (state.projects.length <= 1) {
      throw new Error('至少保留一个项目');
    }

    state.projects.splice(index, 1);
    state.tasks = state.tasks.filter((task) => task.projectId !== id);

    return state;
  });

  if (!result.ok) {
    return [200, { code: 400, data: null, msg: result.reason }];
  }

  return [200, { code: 200, data: null, msg: '项目删除成功' }];
});

mock.onGet('/tasks').reply((config) => {
  const unauthorized = authorize(config);
  if (unauthorized) return unauthorized;
  const {
    keyword = '',
    status = '',
    projectId = '',
    parentId,
    overdue = false,
    page = 1,
    pageSize = 10,
  } = config.params || {};
  if (
    typeof keyword !== 'string' ||
    typeof status !== 'string' ||
    typeof projectId !== 'string' ||
    ![true, false, 'true', 'false'].includes(overdue) ||
    (projectId && !getState().projects.some((project) => project.id === projectId)) ||
    (status && !['todo', 'doing', 'done'].includes(status)) ||
    !validPage(page) ||
    !validPage(pageSize)
  ) {
    return [200, { code: 400, data: null, msg: '查询参数不合法' }];
  }

  if (parentId !== undefined && parentId !== 'root') {
    const parent = getState().tasks.find((task) => task.id === parentId && task.parentId === null);

    if (!parent) {
      return [200, { code: 400, data: null, msg: '父任务不存在或不是顶层任务' }];
    }
  }

  const all = getState().tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false;

    if (parentId === 'root') {
      return task.parentId === null;
    }

    if (parentId !== undefined) {
      return task.parentId === parentId;
    }

    return true;
  });
  const today = getLocalDate();
  const onlyOverdue = overdue === true || overdue === 'true';
  const list = all.filter(
    (t) =>
      t.title.includes(keyword) &&
      (status ? t.status === status : true) &&
      (!onlyOverdue || isOverdue(t, today))
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
  if (!validTask(body) || typeof body.projectId !== 'string') {
    return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  }
  if (!getState().projects.some((project) => project.id === body.projectId)) {
    return [200, { code: 400, data: null, msg: '所属项目不存在' }];
  }
  let newTask;
  const result = saveSnapshot((state) => {
    const parentId = body.parentId === undefined ? null : body.parentId;
    const parent = state.tasks.find((task) => task.id === parentId);

    if (
      parentId !== null &&
      (!parent || parent.parentId !== null || parent.projectId !== body.projectId)
    ) {
      throw new Error('父任务必须是同一项目中的顶层任务');
    }

    if (parent) {
      if (!['todo', 'done'].includes(body.status)) {
        throw new Error('子任务状态只能是待办或已完成');
      }

      if (body.dueDate !== undefined && body.dueDate !== null) {
        throw new Error('子任务不能设置截止日期');
      }
    }

    newTask = {
      id: genId(),
      title: body.title.trim(),
      desc: body.desc,
      status: body.status,
      priority: parent ? parent.priority : body.priority,
      createTime: Date.now(),
      projectId: body.projectId,
      parentId,
      dueDate: body.dueDate === undefined ? null : body.dueDate,
    };

    if (parent && parent.status === 'done') {
      parent.status = 'doing';
    }

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [200, { code: 400, data: null, msg: '任务字段不合法' }];
  }

  const current = getState().tasks.find((t) => t.id === id);
  if (!current) return [200, { code: 400, data: null, msg: '任务不存在' }];

  if (Object.hasOwn(body, 'projectId') && body.projectId !== current.projectId) {
    return [200, { code: 400, data: null, msg: '任务所属项目不可修改' }];
  }

  if (Object.hasOwn(body, 'parentId') && body.parentId !== current.parentId) {
    return [200, { code: 400, data: null, msg: '任务父子关系不可修改' }];
  }
  if (
    ['id', 'createTime'].some(
      (field) => Object.hasOwn(body, field) && body[field] !== current[field]
    )
  ) {
    return [200, { code: 400, data: null, msg: '任务 ID 和创建时间不可修改' }];
  }
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
      dueDate: Object.hasOwn(body, 'dueDate') ? body.dueDate : current.dueDate,
    };
    state.tasks[index] = updated;
    if (updated.parentId === null) {
      state.tasks.forEach((task) => {
        if (task.parentId === updated.id) {
          task.priority = updated.priority;
        }
      });
    }
    if (updated.parentId !== null && updated.status === 'todo') {
      const parent = state.tasks.find((task) => task.id === updated.parentId);

      if (parent && parent.status === 'done') {
        parent.status = 'doing';
      }
    }
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
    state.tasks = state.tasks.filter((task) => task.id !== id && task.parentId !== id);
    return state;
  });

  if (!result.ok) return [200, { code: 400, data: null, msg: result.reason }];
  return [200, { code: 200, data: null, msg: '删除成功' }];
});

mock.onAny().reply(200, { code: 400, data: null, msg: '接口不存在' });
