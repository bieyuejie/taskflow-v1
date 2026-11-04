import assert from 'node:assert/strict';

// 仅由独立临时浏览器入口执行，实际资源记录来自当前构建预览。
export async function verifyLazyRoutesBrowser(browser) {
  const { evaluate, send, fill, click, shown, until, reload, readData } = browser;
  await evaluate(`window.stage5ChartObservers=[];window.stage5NativeObserver=window.ResizeObserver;
    window.ResizeObserver=class extends window.stage5NativeObserver {
      observe(target,options){if(target.classList.contains('chart-box')){this.chartTargets??=new Set();this.chartTargets.add(target);if(!window.stage5ChartObservers.includes(this))window.stage5ChartObservers.push(this);}return super.observe(target,options);}
      unobserve(target){this.chartTargets?.delete(target);return super.unobserve(target);}
      disconnect(){this.chartTargets?.clear();return super.disconnect();}
    };`);
  const statsRequests = () =>
    evaluate(
      "performance.getEntriesByType('resource').filter(item => /\\/Stats-[^/]+\\.js(?:\\?|$)/.test(item.name)).map(item => new URL(item.name).pathname)"
    );
  const kanbanRequests = () =>
    evaluate(
      "performance.getEntriesByType('resource').filter(item => /\\/Kanban-[^/]+\\.js(?:\\?|$)/.test(item.name)).map(item => new URL(item.name).pathname)"
    );
  const taskListRequests = () =>
    evaluate(
      "performance.getEntriesByType('resource').filter(item => /\\/TaskList-[^/]+\\.js(?:\\?|$)/.test(item.name)).map(item => new URL(item.name).pathname)"
    );
  const loginRequests = () =>
    evaluate(
      "performance.getEntriesByType('resource').filter(item => /\\/Login-[^/]+\\.js(?:\\?|$)/.test(item.name)).map(item => new URL(item.name).pathname)"
    );
  const kanbanReady = () =>
    until(
      () =>
        evaluate(
          "document.querySelectorAll('.kanban-column').length === 3 && document.querySelectorAll('.task-card').length === 3 && !!document.querySelector('.kanban-page .project-select .el-select__wrapper:not(.is-disabled)')"
        ),
      '看板及默认任务加载完成'
    );
  const chartsReady = () =>
    until(
      () =>
        evaluate(
          "document.querySelectorAll('.chart-box canvas').length === 2 && !!document.querySelector('.stats-page .project-select .el-select__wrapper:not(.is-disabled)')"
        ),
      '统计页图表加载完成'
    );

  assert.deepEqual(await statsRequests(), [], '登录页不能预加载统计页chunk');
  assert.deepEqual(await kanbanRequests(), [], '登录页不能预加载看板chunk');
  assert.deepEqual(await taskListRequests(), [], '登录前不能加载任务列表chunk');
  assert.equal((await loginRequests()).length, 1, '首次打开登录路由只加载一次独立Login chunk');
  await fill('input[placeholder="请输入账号"]', 'lazy-route-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  await until(
    () =>
      evaluate("document.querySelectorAll('.el-table__body-wrapper .el-table__row').length === 3"),
    '默认列表加载'
  );
  const original = await readData();
  const taskListLoaded = await taskListRequests();
  assert.equal(taskListLoaded.length, 1, '登录后进入任务列表才请求独立chunk');
  console.log(
    `PASS: 登录前未请求TaskList，登录后首次进入才请求 ${taskListLoaded[0]}，默认3条任务正常`
  );
  assert.deepEqual(await statsRequests(), [], '进入任务列表仍不加载统计页chunk');
  assert.deepEqual(await kanbanRequests(), [], '进入任务列表仍不加载看板chunk');
  console.log('PASS: 首次登录页及任务列表实际资源记录中均无Stats/Kanban chunk');

  await evaluate('document.querySelector(\'a[href="#/stats"]\').click()');
  await shown('数据统计');
  await chartsReady();
  const loaded = await statsRequests();
  assert.equal(loaded.length, 1, '首次进入统计页时才请求独立chunk');
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('.el-descriptions__content')].map(item=>item.textContent.trim())"
    ),
    ['3', '1', '33%']
  );
  assert.equal(await readData(), original);
  await evaluate("window.stage5ChartNodes=[...document.querySelectorAll('.chart-box')];void 0");
  assert.equal(
    await evaluate(
      'window.stage5ChartObservers.filter(observer=>observer.chartTargets.size===2).length'
    ),
    1,
    '实际尺寸监听已接入两个图表容器'
  );
  assert.equal(
    await evaluate(
      "window.stage5ChartNodes.every(node=>!!node.getAttribute('_echarts_instance_'))"
    ),
    true,
    '实际图表实例已绑定DOM'
  );
  console.log(`PASS: 首次进入统计页请求独立资源 ${loaded[0]}，两个图表及3/1/33%汇总正常`);

  await evaluate('document.querySelector(\'a[href="#/task-list"]\').click()');
  await shown('新增任务');
  await until(
    () =>
      evaluate("document.querySelectorAll('.el-table__body-wrapper .el-table__row').length === 3"),
    '返回列表加载完成'
  );
  assert.deepEqual(await taskListRequests(), taskListLoaded, '从统计返回列表复用已加载模块');
  assert.equal(
    await evaluate('window.stage5ChartObservers.every(observer=>observer.chartTargets.size===0)'),
    true,
    '卸载后实际ResizeObserver不再观察图表'
  );
  assert.equal(
    await evaluate(
      "window.stage5ChartNodes.every(node=>!document.contains(node)&&node.getAttribute('_echarts_instance_')==='')"
    ),
    true,
    '卸载后实际ECharts实例标记已清空且节点移出页面'
  );
  const currentWidth = await evaluate('innerWidth');
  await send('Emulation.setDeviceMetricsOverride', {
    width: currentWidth === 1280 ? 768 : 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: currentWidth,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  console.log('PASS: 离开统计页后两图表实例释放、ResizeObserver断开，离页后调整尺寸无未捕获异常');
  await evaluate('document.querySelector(\'a[href="#/stats"]\').click()');
  await shown('数据统计');
  await chartsReady();
  assert.deepEqual(await statsRequests(), loaded, '同一文档再次进入统计页复用已加载模块');
  await reload('数据统计');
  await chartsReady();
  assert.equal((await statsRequests()).length, 1, '直接刷新统计路由也能加载独立chunk');
  assert.deepEqual(await taskListRequests(), [], '直接打开统计页不加载任务列表');
  assert.deepEqual(await loginRequests(), [], '已登录直接打开统计页不加载登录页');
  assert.equal(await readData(), original);
  console.log('PASS: 返回列表再进入统计页不重复请求模块；统计路由直接刷新正常，业务快照不变');

  assert.deepEqual(await kanbanRequests(), [], '打开或刷新统计页也不会提前加载看板');
  await evaluate('document.querySelector(\'a[href="#/kanban"]\').click()');
  await shown('任务看板');
  await kanbanReady();
  const kanbanLoaded = await kanbanRequests();
  assert.equal(kanbanLoaded.length, 1, '首次进入看板才请求独立chunk');
  for (let index = 0; index < 3; index++) {
    assert.equal(
      await evaluate(
        `document.querySelectorAll('.kanban-column')[${index}].querySelectorAll('.task-card').length`
      ),
      1
    );
  }
  await evaluate('document.querySelector(\'a[href="#/task-list"]\').click()');
  await shown('新增任务');
  await until(
    () =>
      evaluate("document.querySelectorAll('.el-table__body-wrapper .el-table__row').length === 3"),
    '返回列表完成'
  );
  await evaluate('document.querySelector(\'a[href="#/kanban"]\').click()');
  await shown('任务看板');
  await kanbanReady();
  assert.deepEqual(await kanbanRequests(), kanbanLoaded, '再次进入看板复用已加载模块');
  await reload('任务看板');
  await kanbanReady();
  assert.equal((await kanbanRequests()).length, 1);
  assert.deepEqual(await taskListRequests(), [], '直接打开看板不加载任务列表');
  assert.deepEqual(await loginRequests(), [], '已登录直接打开看板不加载登录页');
  assert.deepEqual(await statsRequests(), [], '直接刷新看板不预加载统计页');
  assert.equal(await readData(), original);
  console.log(
    `PASS: 看板首次导航才请求 ${kanbanLoaded[0]}，三列各1条任务，重访模块复用，直接刷新及快照正常`
  );

  await evaluate('document.querySelector(\'a[href="#/projects"]\').click()');
  await shown('新增项目');
  await shown('默认项目');
  await reload('新增项目');
  await shown('默认项目');
  assert.equal(await readData(), original);
  assert.deepEqual(await loginRequests(), [], '已登录直接打开项目页不加载登录页');
  console.log('PASS: 项目管理路由动态路径修正后，实际导航与直接刷新均正常，原项目和任务不变');

  assert.deepEqual(await taskListRequests(), [], '直接刷新项目页不加载列表');
  await evaluate('document.querySelector(\'a[href="#/task-list"]\').click()');
  await shown('新增任务');
  await until(
    () =>
      evaluate("document.querySelectorAll('.el-table__body-wrapper .el-table__row').length === 3"),
    '项目页导航到列表'
  );
  assert.equal((await taskListRequests()).length, 1);
  await reload('新增任务');
  await until(
    () =>
      evaluate("document.querySelectorAll('.el-table__body-wrapper .el-table__row').length === 3"),
    '任务列表直接刷新'
  );
  assert.equal((await taskListRequests()).length, 1);
  assert.deepEqual(await statsRequests(), []);
  assert.deepEqual(await kanbanRequests(), []);
  assert.deepEqual(await loginRequests(), [], '已登录直接打开列表不加载登录页');
  assert.equal(await readData(), original);
  console.log(
    'PASS: 统计/看板/项目页冷刷新均不预加载TaskList；导航、重访和列表直接刷新正常，快照保留'
  );

  await click('退出登录');
  await shown('演示环境');
  await until(
    () => evaluate('!!document.querySelector(\'input[placeholder="请输入账号"]\')'),
    '登录组件加载完成'
  );
  assert.equal((await loginRequests()).length, 1, '退出时才加载该文档尚未加载的Login chunk');
  assert.equal(await evaluate("localStorage.getItem('taskflow_v1_token')"), null);
  assert.equal(await readData(), original);
  await evaluate("location.hash='/stats'");
  await until(() => evaluate("location.hash === '#/login'"), '未登录访问受保护路由被拦截');
  assert.deepEqual(await statsRequests(), [], '登录守卫先拦截未授权访问，不加载统计页');
  assert.equal((await loginRequests()).length, 1, '守卫重定向复用登录模块');
  await reload('演示环境');
  assert.equal((await loginRequests()).length, 1);
  assert.deepEqual(await taskListRequests(), []);
  assert.deepEqual(await statsRequests(), []);
  assert.deepEqual(await kanbanRequests(), []);
  assert.equal(await readData(), original);
  console.log(
    'PASS: 业务路由冷刷新不加载Login；退出时按需加载，未授权路由先拦截，登录页直接刷新正常且业务数据保留'
  );
}
