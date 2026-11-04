import assert from 'node:assert/strict';

export async function verifyOnlineTableScroll(browser) {
  const { evaluate, send, shown, fill, click, reload, until, readData, capture, seedData } =
    browser;
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(
      `localStorage.setItem('taskflow_v1_data',${JSON.stringify(seedData)});localStorage.removeItem('taskflow_v1_token');location.hash='/login';`
    );
    await reload('演示环境');
    await fill('input[placeholder="请输入账号"]', 'online-table-audit');
    await fill('input[placeholder="请输入密码"]', 'demo');
    await click('登录');
    await shown('新增任务');
    for (const [route, page] of [
      ['/projects', '.projects-page'],
      ['/task-list', '.task-list-page'],
    ]) {
      await evaluate(`document.querySelector('a[href="#${route}"]').click()`);
      await until(
        () => evaluate(`!!document.querySelector('${page} .el-table__row')`),
        '线上表格数据加载'
      );
      const before = await readData();
      const scroll = await evaluate(`(()=>{
        const wrap=document.querySelector('${page} .el-table__body-wrapper .el-scrollbar__wrap');
        const overflow=wrap.scrollWidth>wrap.clientWidth+1;
        wrap.scrollLeft=wrap.scrollWidth;
        wrap.dispatchEvent(new Event('scroll'));
        return {overflow,scrollLeft:wrap.scrollLeft};
      })()`);
      if (scroll.overflow) assert(scroll.scrollLeft > 0, '溢出的表格须能实际横向滚动');
      await until(
        () =>
          evaluate(
            `(()=>{const table=document.querySelector('${page} .el-table').getBoundingClientRect();const button=[...document.querySelectorAll('${page} .el-table__row button')].filter(item=>item.getClientRects().length).at(-1);const rect=button.getBoundingClientRect();return rect.left>=table.left&&rect.right<=table.right+1&&rect.left>=0&&rect.right<=innerWidth+1;})()`
          ),
        '滚动后操作按钮位于表格及视口内'
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      assert.equal(await readData(), before, '表格滚动不得写入快照');
      if (width === 375) {
        await capture(
          route === '/projects' ? 'ONLINE_PROJECTS_SCROLL_375' : 'ONLINE_TASKS_SCROLL_375'
        );
      }
    }
    console.log(`PASS: 线上${width}px项目/任务表格横向滚动、操作列可达、页面不溢出且快照零写入`);
  }
}

export async function verifyOnlineBrowserExtras(browser) {
  const {
    evaluate,
    send,
    shown,
    click,
    fill,
    readData,
    readSnapshot,
    reload,
    until,
    patchWrite,
    capture,
  } = browser;
  const seed = await readData();
  const visibleDialog =
    "[...document.querySelectorAll('.el-dialog')].find(item=>item.getClientRects().length)";
  const closed = () => until(() => evaluate(`!(${visibleDialog})`), '弹窗关闭');
  const boxClosed = () =>
    until(
      () =>
        evaluate(
          "![...document.querySelectorAll('.el-message-box')].some(item=>item.getClientRects().length)"
        ),
      '确认框关闭'
    );
  const go = async (route, selector) => {
    await evaluate(`document.querySelector('a[href="#${route}"]').click()`);
    await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), route);
  };
  const layout = async () => {
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        `!(${visibleDialog}) || (()=>{const rect=(${visibleDialog}).getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1;})()`
      ),
      true
    );
  };
  const login = async () => {
    await fill('input[placeholder="请输入账号"]', 'online-extra-audit');
    await fill('input[placeholder="请输入密码"]', 'demo');
    await click('登录');
    await shown('新增任务');
    await until(
      () => evaluate("document.querySelectorAll('.task-list-page .el-table__row').length===3"),
      '默认任务加载'
    );
  };

  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(
      `localStorage.setItem('taskflow_v1_data',${JSON.stringify(seed)});localStorage.removeItem('taskflow_v1_token');location.hash='/login';`
    );
    await reload('演示环境');
    const unknown = JSON.stringify({ ...JSON.parse(seed), schemaVersion: 999 });
    await evaluate(`localStorage.setItem('taskflow_v1_data',${JSON.stringify(unknown)})`);
    await reload('本地数据版本不受支持');
    assert.equal(await readData(), unknown);
    await layout();
    await click('重置本地数据');
    await shown('确认重置本地数据');
    await click('取消');
    await boxClosed();
    assert.equal(await readData(), unknown);
    await patchWrite('taskflow_v1_data');
    await click('重置本地数据');
    await shown('确认重置本地数据');
    await click('确认重置');
    await shown('存储写入失败');
    assert.equal(await readData(), unknown);
    assert.equal(await evaluate("!!document.querySelector('.storage-notice')"), true);
    await boxClosed();
    await evaluate('Storage.prototype.setItem=window.restoreSet');
    await until(
      () =>
        evaluate("[...document.querySelectorAll('.storage-notice button')].every(b=>!b.disabled)"),
      '恢复重置按钮'
    );
    await click('重置本地数据');
    await shown('确认重置本地数据');
    await click('确认重置');
    await until(async () => (await readSnapshot())?.schemaVersion === 1, '确认恢复合法快照');
    await boxClosed();
    await until(() => evaluate("!document.querySelector('.storage-notice')"), '恢复业务入口');
    await shown('演示环境');
    await login();
    console.log(`PASS: 线上${width}px未知版本保留、取消零写入、确认重置失败仍保留、恢复重试成功`);

    await go('/projects', '.projects-page');
    await until(
      () => evaluate("document.querySelectorAll('.projects-page .el-table__row').length===1"),
      '默认项目加载'
    );
    const beforeProjects = await readSnapshot();
    const projectName = `线上编辑项目-${width}`;
    await click('新增项目');
    await until(() => evaluate(`!!(${visibleDialog})`), '新增项目弹窗');
    await fill('.el-dialog input', projectName);
    await fill('.el-dialog textarea', '编辑前描述');
    await click('保存');
    await closed();
    const created = (await readSnapshot()).projects.find((project) => project.name === projectName);
    assert(created);
    await evaluate(
      `(()=>{const row=[...document.querySelectorAll('.projects-page .el-table__row')].find(item=>item.innerText.includes(${JSON.stringify(projectName)}));[...row.querySelectorAll('button')].find(item=>item.textContent.trim()==='编辑').click();})()`
    );
    await until(() => evaluate(`!!(${visibleDialog})`), '编辑项目弹窗');
    const beforeEdit = await readData();
    await fill('.el-dialog input', beforeProjects.projects[0].name);
    await click('保存');
    await shown('项目名称重复');
    assert.equal(await readData(), beforeEdit);
    const editedName = `项目修改后-${width}`;
    await fill('.el-dialog input', `  ${editedName}  `);
    await fill('.el-dialog textarea', '编辑后描述');
    await patchWrite('taskflow_v1_data');
    await click('保存');
    await shown('存储写入失败');
    assert.equal(await readData(), beforeEdit);
    assert.equal(
      await evaluate("document.querySelector('.el-dialog input').value"),
      `  ${editedName}  `
    );
    await evaluate('Storage.prototype.setItem=window.restoreSet');
    await click('保存');
    await closed();
    const edited = (await readSnapshot()).projects.find((project) => project.id === created.id);
    assert.deepEqual(edited, { ...created, name: editedName, desc: '编辑后描述' });
    assert.deepEqual((await readSnapshot()).tasks, beforeProjects.tasks);
    await reload(editedName);
    await layout();
    await capture(`ONLINE_PROJECTS_${width}`);
    await evaluate(
      `(()=>{const row=[...document.querySelectorAll('.projects-page .el-table__row')].find(item=>item.innerText.includes(${JSON.stringify(editedName)}));[...row.querySelectorAll('button')].find(item=>item.textContent.trim()==='删除').click();})()`
    );
    await shown('0 个顶层任务和 0 个子任务');
    await click('确认删除');
    await boxClosed();
    await until(async () => (await readSnapshot()).projects.length === 1, '删除新建空项目');
    console.log(
      `PASS: 线上${width}px项目新增/编辑/删除、名称查重、trim、写失败保留草稿、重试、ID和创建时间不变及刷新保持`
    );

    await go('/task-list', '.task-list-page');
    await until(
      () => evaluate("document.querySelectorAll('.task-list-page .el-table__row').length===3"),
      '任务列表加载'
    );
    await click('新增任务');
    await until(() => evaluate(`!!(${visibleDialog})`), '任务弹窗');
    await fill('.el-dialog input', `线上布局任务-${width}`);
    await layout();
    await capture(`ONLINE_TASK_DIALOG_${width}`);
    await click('取消');
    await closed();
    await evaluate(
      "[...document.querySelector('.task-list-page .el-table__row').querySelectorAll('button')].find(item=>item.textContent.trim()==='子任务').click()"
    );
    await shown('暂无子任务');
    await layout();
    await capture(`ONLINE_SUBTASK_DIALOG_${width}`);
    await evaluate(`(${visibleDialog}).querySelector('.el-dialog__headerbtn').click()`);
    await closed();
    await go('/kanban', '.kanban-page');
    await until(
      () => evaluate("document.querySelectorAll('.task-card').length===3"),
      '看板默认任务'
    );
    await layout();
    await capture(`ONLINE_KANBAN_${width}`);
    const beforeUnauthorized = await readData();
    await evaluate("localStorage.setItem('taskflow_v1_token','invalid-online-demo-token')");
    await evaluate(
      "document.querySelector('.kanban-page .project-select .el-select__wrapper').click()"
    );
    const unauthorizedProject = (await readSnapshot()).projects[0].name;
    const unauthorizedOption = `[...document.querySelectorAll('.el-select-dropdown__item')].find(item=>item.getClientRects().length&&item.textContent.trim()===${JSON.stringify(unauthorizedProject)})`;
    await until(() => evaluate(`!!(${unauthorizedOption})`), '当前页面的鉴权查询选项');
    await evaluate(`(${unauthorizedOption}).click()`);
    await shown('登录已失效');
    await shown('演示环境');
    assert.equal(await evaluate('location.hash'), '#/login');
    assert.equal(await evaluate("localStorage.getItem('taskflow_v1_token')"), null);
    assert.equal(await readData(), beforeUnauthorized);
    await login();

    const empty = JSON.stringify({ ...(await readSnapshot()), tasks: [] });
    await evaluate(`localStorage.setItem('taskflow_v1_data',${JSON.stringify(empty)})`);
    await reload('暂无任务');
    assert.equal(await readData(), empty);
    await go('/kanban', '.kanban-page');
    await until(
      () =>
        evaluate(
          "document.querySelectorAll('.kanban-column').length===3&&document.querySelectorAll('.task-card').length===0"
        ),
      '合法空看板'
    );
    await go('/stats', '.stats-page');
    const emptySummary = () =>
      evaluate(
        "[...document.querySelectorAll('.stats-page .el-descriptions__content')].map(item=>item.textContent.trim())"
      );
    await until(
      async () => JSON.stringify(await emptySummary()) === '["0","0","0%"]',
      '合法空统计'
    );
    await reload('数据统计');
    await until(
      async () => JSON.stringify(await emptySummary()) === '["0","0","0%"]',
      '空统计刷新'
    );
    assert.equal(await readData(), empty);
    await click('退出登录');
    await shown('演示环境');
    assert.equal(await readData(), empty);
    console.log(
      `PASS: 线上${width}px任务/子任务弹窗及看板布局、业务401退出保留数据、合法空任务/看板/统计及刷新不回填示例`
    );
  }
}
