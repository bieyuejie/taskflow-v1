export const SCHEMA_VERSION = 1;

const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

const MAX_PROJECT_NAME = 50;
const MAX_PROJECT_DESC = 500;
const MAX_TITLE = 100;
const MAX_TASK_DESC = 2000;

function fail(reason) {
  return { ok: false, reason };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value) {
  return Number.isInteger(value) && !Number.isNaN(new Date(value).getTime());
}

function isId(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && isTimestamp(Number(value));
}

function isDueDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function validateProject(p) {
  if (!isRecord(p)) {
    return fail('project 不是对象');
  }

  if (!isId(p.id)) {
    return fail('project.id 不合法');
  }

  if (typeof p.name !== 'string' || !p.name.trim()) {
    return fail('project.name为空');
  }

  if (p.name.trim().length > MAX_PROJECT_NAME) {
    return fail(`project.name超过${MAX_PROJECT_NAME}字符`);
  }

  if (typeof p.desc !== 'string') {
    return fail('project.desc 不是字符串');
  }
  if (p.desc.length > MAX_PROJECT_DESC) {
    return fail(`project.desc 超过 ${MAX_PROJECT_DESC} 字符`);
  }

  if (!isTimestamp(p.createTime)) {
    return fail('project.createTime 不是有效的整数时间戳');
  }

  return { ok: true };
}

function validateTask(t) {
  if (!isRecord(t)) {
    return fail('task 不是对象');
  }

  if (!isId(t.id)) {
    return fail('task.id 不合法');
  }

  if (typeof t.title !== 'string' || !t.title.trim()) {
    return fail('task.title 为空');
  }
  if (t.title.trim().length > MAX_TITLE) {
    return fail(`task.title 超过 ${MAX_TITLE} 字符`);
  }

  if (typeof t.desc !== 'string') {
    return fail('task.desc 不是字符串');
  }
  if (t.desc.length > MAX_TASK_DESC) {
    return fail(`task.desc 超过 ${MAX_TASK_DESC} 字符`);
  }

  if (!STATUSES.includes(t.status)) {
    return fail(`task.status 非法: ${t.status}`);
  }

  if (!PRIORITIES.includes(t.priority)) {
    return fail(`task.priority 非法: ${t.priority}`);
  }

  if (!isTimestamp(t.createTime)) {
    return fail('task.createTime 不是有效的整数时间戳');
  }

  if (!isId(t.projectId)) {
    return fail(`task.projectId 形状非法: ${t.projectId}`);
  }

  if (t.parentId !== null && !isId(t.parentId)) {
    return fail(`task.parentId 类型非法: ${t.id}`);
  }

  if (!isDueDate(t.dueDate)) {
    return fail(`task.dueDate 必须为 null 或有效的 YYYY-MM-DD 日期: ${t.id}`);
  }

  return { ok: true };
}
export function validateSnapshot(snapshot) {
  // ─── 关卡 1：顶层形状（前面写过，保持不变）───
  if (!isRecord(snapshot)) return fail('快照不是对象');
  if (snapshot.schemaVersion !== SCHEMA_VERSION) return fail('schemaVersion 不匹配');
  if (!Array.isArray(snapshot.projects)) return fail('projects 不是数组');
  if (!Array.isArray(snapshot.tasks)) return fail('tasks 不是数组');
  if (snapshot.projects.length === 0) return fail('至少保留一个项目');

  // ─── 关卡 2：遍历 projects，建索引 ───
  const projectIds = new Set();
  const projectNames = new Set();
  for (const p of snapshot.projects) {
    const r = validateProject(p);
    if (!r.ok) return r;

    if (projectIds.has(p.id)) return fail(`项目 ID 重复: ${p.id}`);
    projectIds.add(p.id);

    // name 要 trim 后查重（"学习" 和 "学习 " 算同一个）
    const name = p.name.trim();
    if (projectNames.has(name)) return fail(`项目名称重复: ${name}`);
    projectNames.add(name);
  }

  // ─── 关卡 3：遍历 tasks，校验字段 + 查 projectId + 建 taskById ───
  const taskById = new Map();
  for (const t of snapshot.tasks) {
    const r = validateTask(t);
    if (!r.ok) return r;

    if (taskById.has(t.id)) return fail(`任务 ID 重复: ${t.id}`);

    // projectId 必须指向真实项目
    if (!projectIds.has(t.projectId)) {
      return fail(`任务 ${t.id} 引用了不存在的项目 ${t.projectId}`);
    }

    taskById.set(t.id, t);
  }

  // ─── 关卡 4：查 parentId 跨条关系 ───
  for (const t of snapshot.tasks) {
    // 顶层任务：parentId 是 null，跳过
    if (t.parentId === null) continue;

    // 父任务必须存在
    const parent = taskById.get(t.parentId);
    if (!parent) {
      return fail(`子任务 ${t.id} 引用了不存在的父任务 ${t.parentId}`);
    }

    // 父任务自己必须是顶层（不允许二级嵌套）
    if (parent.parentId !== null) {
      return fail(`不允许二级子任务: ${t.id} 的父任务 ${parent.id} 本身也是子任务`);
    }

    // 子任务和父任务必须同项目
    if (parent.projectId !== t.projectId) {
      return fail(
        `子任务 ${t.id} 跨项目引用: 父任务在 ${parent.projectId}, 子任务在 ${t.projectId}`
      );
    }

    // 子任务 dueDate 必须是 null
    if (t.dueDate !== null) {
      return fail(`子任务 ${t.id} 的 dueDate 必须为 null`);
    }

    // 子任务 status 只能是 todo/done
    if (!['todo', 'done'].includes(t.status)) {
      return fail(`子任务 ${t.id} 的 status 只能是 todo/done, 当前为 ${t.status}`);
    }

    // 子任务 priority 必须跟随父任务
    if (t.priority !== parent.priority) {
      return fail(`子任务 ${t.id} 的 priority 必须与父任务一致`);
    }

    if (parent.status === 'done' && t.status !== 'done') {
      return fail(`父任务 ${parent.id} 存在未完成子任务，不能标记为 done`);
    }
  }

  return { ok: true };
}
