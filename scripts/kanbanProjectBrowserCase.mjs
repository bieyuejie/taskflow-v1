import assert from 'node:assert/strict';

export async function verifyKanbanProjectsBrowser(browser) {
  const { evaluate, send, shown, click, fill, readData, reload, until } = browser;
  const projects = ['看板项目A', '看板项目B', '看板空项目'].map((name, index) => ({
    id: String(1800000000000 + index),
    name,
    desc: '',
    createTime: 1800000000000,
  }));
  const tasks = Array.from({ length: 103 }, (_, index) => ({
    id: String(1800000000100 + index),
    title: `看板任务${index + 1}`,
    desc: '',
    status: ['todo', 'doing', 'done'][index % 3],
    priority: 'low',
    createTime: 1800000000000,
    projectId: projects[index < 101 ? 0 : 1].id,
    parentId: null,
    dueDate: null,
  }));
  const snapshot = {
    schemaVersion: 1,
    projects,
    tasks: [
      ...tasks,
      { ...tasks[0], id: '1800000001000', title: '不应出现的子任务', parentId: tasks[0].id },
    ],
  };
  const original = JSON.stringify(snapshot);
  // 只在验收脚本创建的独立临时浏览器内放置测试夹具。
  await evaluate(`localStorage.setItem('taskflow_v1_data', ${JSON.stringify(original)})`);
  await reload('演示环境');
  await fill('input[placeholder="请输入账号"]', 'kanban-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');

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
    await until(() => evaluate(`!!(${option})`), `找到项目${name}`);
    await evaluate(`(${option}).click()`);
  };
  const expectedTasks = (projectId) =>
    tasks.filter((task) => !projectId || task.projectId === projectId);
  const checkBoard = async (projectId) => {
    const expected = expectedTasks(projectId);
    const titles = expected.map((task) => task.title).sort();
    await until(async () => {
      const actual = await evaluate(
        "[...document.querySelectorAll('.kanban-page .task-card-title')].map(item => item.textContent.trim()).sort()"
      );
      return (
        JSON.stringify(actual) === JSON.stringify(titles) &&
        (await evaluate(
          "!document.querySelector('.kanban-page .project-select .el-select__wrapper').classList.contains('is-disabled')"
        ))
      );
    }, `看板显示${expected.length}条顶层任务`);
    for (const [index, status] of ['todo', 'doing', 'done'].entries()) {
      assert.equal(
        await evaluate(
          `document.querySelectorAll('.kanban-column')[${index}].querySelectorAll('.task-card').length`
        ),
        expected.filter((task) => task.status === status).length
      );
    }
    assert.equal(await readData(), original, '筛选不能写入或修改业务快照');
  };

  await selectProject('.task-list-page', projects[0].name);
  await until(
    () =>
      evaluate("document.querySelector('.page-header p')?.textContent.includes('共 101 个任务')"),
    '列表选中项目A'
  );
  await evaluate('document.querySelector(\'a[href="#/kanban"]\').click()');
  await shown('任务看板');
  await checkBoard(projects[0].id);
  console.log('PASS: 列表选中项目A后进入看板，加载101条顶层任务，跨页无遗漏且不计子任务');

  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const project of [...projects, { id: '', name: '全部项目' }]) {
      await selectProject('.kanban-page', project.name);
      await checkBoard(project.id);
    }
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      '页面没有横向溢出'
    );
    console.log(
      `PASS: ${width}px 实际下拉选择项目A/B/空项目/全部项目，数量101/2/0/103正确，状态分列正确，快照不变，无横向溢出`
    );
  }
  await selectProject('.kanban-page', projects[1].name);
  await checkBoard(projects[1].id);
  await evaluate('document.querySelector(\'a[href="#/task-list"]\').click()');
  await shown('新增任务');
  await until(
    () => evaluate("document.querySelector('.page-header p')?.textContent.includes('共 2 个任务')"),
    '返回列表保留项目B'
  );
  await evaluate('document.querySelector(\'a[href="#/kanban"]\').click()');
  await shown('任务看板');
  await checkBoard(projects[1].id);
  console.log('PASS: 看板选择项目B后返回列表，再进入看板，两页项目一致');

  await reload('任务看板');
  await checkBoard('');
  assert(
    (await evaluate("document.querySelector('.kanban-page .project-select').innerText")).includes(
      '全部项目'
    )
  );
  console.log('PASS: 直接刷新看板后项目选项重新加载，UI筛选恢复全部，业务快照保留');
}
