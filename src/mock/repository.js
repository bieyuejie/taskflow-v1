import { storageGet, storageSet, DATA_KEY } from '../utils/storage';
import { validateSnapshot, SCHEMA_VERSION } from '../utils/validateData';
import { genId, reserveIds } from '../utils/id';

let state = null;
let status = { ok: false, kind: 'uninitialized', reason: '正在读取本地数据', canReset: false };

function block(kind, reason, canReset = false) {
  status = { ok: false, kind, reason, canReset };
  return getRepositoryStatus();
}

export function getRepositoryStatus() {
  return { ...status };
}

function publish(snapshot) {
  reserveIds([...snapshot.projects, ...snapshot.tasks].map((item) => item.id));
  state = snapshot;
  status = { ok: true, kind: 'ready', reason: '', canReset: false };
}

export function initRepository() {
  const result = storageGet(DATA_KEY);
  if (!result.ok) return block('read-error', result.reason);
  const raw = result.value;
  if (raw === null) {
    try {
      const saved = commit(createDefaultSnapshot());
      if (!saved.ok) return block('write-error', saved.reason);
      return getRepositoryStatus();
    } catch (error) {
      return block('write-error', error.message);
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return block('corrupt', '本地数据无法解析，原值已保留。请重试或确认后重置本地数据', true);
  }
  if (parsed && typeof parsed === 'object' && parsed.schemaVersion !== SCHEMA_VERSION) {
    return block('unsupported', '本地数据版本不受支持，原值已保留。请重试或确认后重置', true);
  }
  const r = validateSnapshot(parsed);
  if (!r.ok) return block('corrupt', `本地数据校验失败：${r.reason}。原值已保留`, true);
  publish(parsed);
  return getRepositoryStatus();
}

function createDefaultSnapshot() {
  const now = Date.now();
  const project = {
    id: genId(),
    name: '默认项目',
    desc: '',
    createTime: now,
  };
  const tasks = [
    { title: '学习Vue3', desc: '组合式API', status: 'todo', priority: 'high' },
    { title: '写登录页', desc: '表单校验', status: 'doing', priority: 'medium' },
    { title: '部署项目', desc: 'GitHub Pages', status: 'done', priority: 'low' },
  ].map((t) => ({
    id: genId(),
    title: t.title,
    desc: t.desc,
    status: t.status,
    priority: t.priority,
    createTime: now,
    projectId: project.id,
    parentId: null,
    dueDate: null,
  }));
  return { schemaVersion: SCHEMA_VERSION, projects: [project], tasks };
}

export function getState() {
  return state === null ? null : structuredClone(state);
}

export function saveSnapshot(mutator) {
  if (!status.ok) return { ok: false, reason: status.reason };
  try {
    return commit(mutator(structuredClone(state)));
  } catch (error) {
    return { ok: false, reason: `无法构造保存数据：${error.message}` };
  }
}

function commit(candidate) {
  try {
    const snapshot = structuredClone(candidate);
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) return validation;
    const text = JSON.stringify(snapshot);
    const saved = storageSet(DATA_KEY, text);
    if (!saved.ok) return saved;
    publish(snapshot);
    return { ok: true, data: getState() };
  } catch (error) {
    return { ok: false, reason: `数据保存失败：${error.message}` };
  }
}

export function resetRepository(confirmed) {
  if (confirmed !== true || !status.canReset) {
    return { ok: false, reason: '仅在数据损坏或版本不支持时，经明确确认后才可重置' };
  }
  try {
    const result = commit(createDefaultSnapshot());
    if (!result.ok) status = { ...status, reason: `重置失败，原数据已保留：${result.reason}` };
    return result;
  } catch (error) {
    return { ok: false, reason: `重置失败：${error.message}` };
  }
}
