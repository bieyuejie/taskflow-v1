import assert from 'node:assert/strict';

// 只由 verifyBrowser.mjs 在独立临时浏览器配置中运行。
export async function verifyTaskProjectOwnership(browser) {
  const { evaluate, send, shown, click, fill, readData, readSnapshot, reload, until, patchWrite } =
    browser;
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const before = await readSnapshot();
  const first = before.projects[0];
  const projectName = '任务归属验收项目';
  const dialogOpen = () =>
    evaluate(
      "[...document.querySelectorAll('.el-dialog')].some(dialog => dialog.getClientRects().length)"
    );
  const waitClosed = () => until(async () => !(await dialogOpen()), '任务弹窗关闭');
  const selectProject = async (scope, name) => {
    const selector = `${scope} .project-select .el-select__wrapper`;
    await until(
      () =>
        evaluate(
          `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).classList.contains('is-disabled')`
        ),
      '项目选择可用'
    );
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const option = `[...document.querySelectorAll('.el-select-dropdown__item')].find(item => item.getClientRects().length && item.textContent.trim() === ${JSON.stringify(name)})`;
    await until(() => evaluate(`!!(${option})`), `项目选项${name}`);
    await evaluate(`(${option}).click()`);
  };
  const openTask = async () => {
    await click('新增任务');
    await until(dialogOpen, '新增任务弹窗');
  };
  const readProjectLabel = () =>
    evaluate("document.querySelector('.el-dialog .project-select').innerText");
  const waitTask = (title) =>
    until(async () => (await readSnapshot()).tasks.some((task) => task.title === title), title);

  await click('新增项目');
  await until(dialogOpen, '新增项目弹窗');
  await fill('.el-dialog input', projectName);
  await click('保存');
  await waitClosed();
  await shown(projectName);
  const target = (await readSnapshot()).projects.find((project) => project.name === projectName);
  await evaluate('document.querySelector(\'a[href="#/task-list"]\').click()');
  await shown('新增任务');
  await selectProject('.toolbar', projectName);
  await until(
    () => evaluate("document.querySelector('.page-header p')?.textContent.includes('共 0 个任务')"),
    '目标项目为空'
  );
  await openTask();
  assert((await readProjectLabel()).includes(projectName), '新增默认归入当前项目');
  await fill('.el-dialog input', '指定项目新增');
  await evaluate(`window.taskWrites = 0; window.originalTaskSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'taskflow_v1_data') window.taskWrites++;
      return window.originalTaskSet.call(this, key, value);
    };`);
  await evaluate(
    "(() => { const button = [...document.querySelectorAll('.el-dialog button')].find(item => item.textContent.trim() === '确定'); button.click(); button.click(); })()"
  );
  await waitTask('指定项目新增');
  await waitClosed();
  assert.equal(await evaluate('window.taskWrites'), 1);
  let snapshot = await readSnapshot();
  const created = snapshot.tasks.find((task) => task.title === '指定项目新增');
  assert.equal(created.projectId, target.id);
  assert.equal(created.parentId, null);
  assert.equal(created.dueDate, null);
  assert.deepEqual(
    snapshot.tasks.filter((task) => task.projectId === first.id),
    before.tasks
  );
  await reload('指定项目新增');
  assert.deepEqual(await readSnapshot(), snapshot);
  console.log(
    'PASS: 新增默认选中当前项目，连续保存只写一次，归属非首个项目且刷新保留，其他项目任务不变'
  );

  await openTask();
  assert((await readProjectLabel()).includes(first.name), '全部项目筛选下默认选择第一个实际项目');
  await selectProject('.el-dialog', projectName);
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.el-select-dropdown__item')].some(item => item.getClientRects().length && item.textContent.trim() === '全部项目')"
    ),
    false,
    '任务所属项目不提供全部项目选项'
  );
  await fill('.el-dialog input', '从全部项目选择归属');
  await click('确定');
  await waitTask('从全部项目选择归属');
  await waitClosed();
  assert.equal(
    (await readSnapshot()).tasks.find((task) => task.title === '从全部项目选择归属').projectId,
    target.id
  );
  await evaluate(
    "[...document.querySelectorAll('.el-table__row')].find(row => row.innerText.includes('指定项目新增')).querySelector('button').click()"
  );
  await until(dialogOpen, '编辑任务弹窗');
  assert((await readProjectLabel()).includes(projectName));
  assert.equal(
    await evaluate(
      "document.querySelector('.el-dialog .project-select .el-select__wrapper').classList.contains('is-disabled')"
    ),
    true
  );
  await fill('.el-dialog input', '编辑保留所属项目');
  await click('确定');
  await waitTask('编辑保留所属项目');
  await waitClosed();
  const edited = (await readSnapshot()).tasks.find((task) => task.id === created.id);
  assert.equal(edited.projectId, target.id);
  assert.equal(edited.createTime, created.createTime);
  console.log(
    'PASS: 全部项目下可手动选择具体归属，编辑回填原项目且禁止修改，保存后ID/创建时间/归属不变'
  );

  await selectProject('.toolbar', projectName);
  await openTask();
  await fill('.el-dialog input', '归属失败后重试');
  const valid = await readData();
  await patchWrite('taskflow_v1_data');
  await click('确定');
  await shown('存储写入失败');
  assert.equal(await readData(), valid);
  assert.equal(await dialogOpen(), true);
  assert((await readProjectLabel()).includes(projectName));
  assert.equal(
    await evaluate("document.querySelector('.el-dialog input').value"),
    '归属失败后重试'
  );
  await evaluate('Storage.prototype.setItem = window.restoreSet');
  await click('确定');
  await waitTask('归属失败后重试');
  await waitClosed();
  const retried = (await readSnapshot()).tasks.filter((task) => task.title === '归属失败后重试');
  assert.equal(retried.length, 1);
  assert.equal(retried[0].projectId, target.id);
  console.log('PASS: 写入失败保留项目选择和表单输入、原快照不变，恢复后重试只创建一次且归属正确');

  for (const width of [375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await selectProject('.toolbar', projectName);
    await openTask();
    assert((await readProjectLabel()).includes(projectName));
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        "(() => { const rect = document.querySelector('.el-dialog').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })()"
      ),
      true
    );
    const title = `${width}px项目归属`;
    await fill('.el-dialog input', title);
    await click('确定');
    await waitTask(title);
    await waitClosed();
    await reload(title);
    assert.equal(
      (await readSnapshot()).tasks.find((task) => task.title === title).projectId,
      target.id
    );
    console.log(`PASS: ${width}px新增所属项目和刷新验证通过，页面及弹窗无横向溢出`);
  }
}
