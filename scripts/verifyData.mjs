import assert from 'node:assert/strict';
import { genId } from '../src/utils/id.js';
import { validateSnapshot } from '../src/utils/validateData.js';

const projectId = '1793000000000';
const rootId = '1793000000001';
const childId = '1793000000002';
const otherProjectId = '1793000000003';
const createTime = 1793000000000;

function makeSnapshot() {
  const root = {
    id: rootId,
    title: '父任务',
    desc: '',
    status: 'todo',
    priority: 'low',
    createTime,
    projectId,
    parentId: null,
    dueDate: null,
  };
  return {
    schemaVersion: 1,
    projects: [{ id: projectId, name: '项目', desc: '', createTime }],
    tasks: [root, { ...root, id: childId, title: '子任务', parentId: rootId }],
  };
}

let cases = 0;
function check(snapshot, expectedOk, label) {
  const before = structuredClone(snapshot);
  const result = validateSnapshot(snapshot);
  assert.equal(result.ok, expectedOk, label);
  if (!expectedOk) assert.equal(typeof result.reason, 'string', `${label} 应提供失败原因`);
  assert.deepEqual(snapshot, before, `${label} 不应修改传入数据`);
  cases += 1;
}

check(makeSnapshot(), true, '合法父子快照');
const emptyTasks = makeSnapshot();
emptyTasks.tasks = [];
check(emptyTasks, true, '保留项目的合法空任务集合');
const limits = makeSnapshot();
limits.projects[0].name = '项'.repeat(50);
limits.projects[0].desc = '描'.repeat(500);
limits.tasks[0].title = '任'.repeat(100);
limits.tasks[0].desc = '描'.repeat(2000);
check(limits, true, '所有长度上限允许等于限制');
const completed = makeSnapshot();
completed.tasks.forEach((task) => {
  task.status = 'done';
});
check(completed, true, '父子均完成');
const manualParent = makeSnapshot();
manualParent.tasks[1].status = 'done';
check(manualParent, true, '子任务完成不强制父任务完成');

const invalidCases = [
  ['缺失项目描述', (s) => delete s.projects[0].desc],
  ['项目描述不是字符串', (s) => (s.projects[0].desc = 123)],
  ['项目描述超过500字', (s) => (s.projects[0].desc = 'x'.repeat(501))],
  ['项目名称超过50字', (s) => (s.projects[0].name = 'x'.repeat(51))],
  ['空白项目名称', (s) => (s.projects[0].name = ' ')],
  ['任务标题超过100字', (s) => (s.tasks[0].title = 'x'.repeat(101))],
  ['任务描述超过2000字', (s) => (s.tasks[0].desc = 'x'.repeat(2001))],
  ['空白任务标题', (s) => (s.tasks[0].title = ' ')],
  [
    '空项目集合',
    (s) => {
      s.projects = [];
      s.tasks = [];
    },
  ],
  ['未知快照版本', (s) => (s.schemaVersion = 2)],
  ['非法任务状态', (s) => (s.tasks[0].status = 'unknown')],
  ['非法优先级', (s) => (s.tasks[0].priority = 'unknown')],
  ['缺失父任务字段', (s) => delete s.tasks[0].parentId],
  ['子任务有截止日期', (s) => (s.tasks[1].dueDate = '2026-10-27')],
  ['子任务进行中', (s) => (s.tasks[1].status = 'doing')],
  ['子任务优先级不一致', (s) => (s.tasks[1].priority = 'high')],
  ['父任务完成但子任务未完成', (s) => (s.tasks[0].status = 'done')],
  ['不存在的项目', (s) => (s.tasks[0].projectId = otherProjectId)],
  ['不存在的父任务', (s) => (s.tasks[1].parentId = otherProjectId)],
  ['任务自引用', (s) => (s.tasks[0].parentId = rootId)],
  ['父子循环', (s) => (s.tasks[0].parentId = childId)],
  ['重复任务ID', (s) => (s.tasks[1].id = rootId)],
  ['重复项目ID', (s) => s.projects.push({ ...s.projects[0], name: '另一项目' })],
  [
    '项目名trim后重复',
    (s) => s.projects.push({ ...s.projects[0], id: otherProjectId, name: ' 项目 ' }),
  ],
  [
    '跨项目父子关系',
    (s) => {
      s.projects.push({ ...s.projects[0], id: otherProjectId, name: '另一项目' });
      s.tasks[1].projectId = otherProjectId;
    },
  ],
  ['二级子任务', (s) => s.tasks.push({ ...s.tasks[1], id: otherProjectId, parentId: childId })],
];
for (const [label, mutate] of invalidCases) {
  const snapshot = makeSnapshot();
  mutate(snapshot);
  check(snapshot, false, label);
}

for (const [date, valid] of [
  [null, true],
  ['2026-10-27', true],
  ['2024-02-29', true],
  ['2000-02-29', true],
  ['0004-02-29', true],
  ['0099-12-31', true],
  ['2026-02-30', false],
  ['2026-02-29', false],
  ['1900-02-29', false],
  ['2100-02-29', false],
  ['2026-04-31', false],
  ['2026-00-01', false],
  ['2026-13-01', false],
  ['2026-01-00', false],
  ['0000-01-01', false],
  ['2026-2-03', false],
  ['2026-10-27T00:00:00Z', false],
  ['not-a-date', false],
  ['', false],
  [undefined, false],
]) {
  const snapshot = makeSnapshot();
  snapshot.tasks[0].dueDate = date;
  check(snapshot, valid, `截止日期 ${String(date)}`);
}

for (const value of [NaN, Infinity, -Infinity, 8640000000000001, 1.5, '1793000000000']) {
  for (const field of ['projects', 'tasks']) {
    const snapshot = makeSnapshot();
    snapshot[field][0].createTime = value;
    check(snapshot, false, `${field}.createTime=${String(value)}`);
  }
}
for (const value of ['', ' ', 'abc', '-1', '1.5', '01', '1e12', '8640000000000001']) {
  for (const field of ['projects', 'tasks']) {
    const snapshot = makeSnapshot();
    snapshot[field][0].id = value;
    check(snapshot, false, `${field}.id=${value}`);
  }
}
for (const value of [null, [], {}, { schemaVersion: 1, projects: {}, tasks: [] }]) {
  check(value, false, '非法顶层形状');
}

const originalNow = Date.now;
let clock = createTime;
try {
  Date.now = () => clock;
  const ids = Array.from({ length: 1000 }, () => genId());
  assert.equal(new Set(ids).size, 1000, '同毫秒ID不可重复');
  assert.equal(BigInt(ids.at(-1)) - BigInt(ids[0]), 999n, '同毫秒ID依次递增');
  clock -= 10000;
  assert(BigInt(genId()) > BigInt(ids.at(-1)), '当前进程时钟回拨时ID仍递增');
} finally {
  Date.now = originalNow;
}
console.log(`PASS: ${cases} 组快照校验断言、1000个同毫秒ID及进程内时钟回拨保护`);
