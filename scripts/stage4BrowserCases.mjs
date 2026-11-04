import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// 仅供独立临时浏览器入口使用，夹具及故障注入不进入产品代码。
export async function verifyStage4Browser(browser) {
  const {
    evaluate,
    send,
    shown,
    click,
    readData,
    readSnapshot,
    reload,
    until,
    capture,
    interceptDrag,
    dragData,
  } = browser;
  const projectNames = ['联动项目A', '联动项目B', '联动空项目'];
  const projects = projectNames.map((name, index) => ({
    id: String(1800000010000 + index),
    name,
    desc: '',
    createTime: 1800000010000,
  }));
  const taskStore =
    "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task')";
  const projectStore =
    "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project')";
  const makeTask = (index, projectIndex, status, title) => ({
    id: String(1800000010100 + index),
    title,
    desc: '',
    status,
    priority: ['low', 'medium', 'high'][index % 3],
    createTime: 1800000010000,
    projectId: projects[projectIndex].id,
    parentId: null,
    dueDate: null,
  });
  const statsTasks = Array.from({ length: 103 }, (_, index) =>
    makeTask(
      index,
      index < 101 ? 0 : 1,
      index < 101 ? ['todo', 'doing', 'done'][index % 3] : 'done',
      `联动任务${index + 1}`
    )
  );
  const child = {
    ...statsTasks[0],
    id: '1800000010900',
    title: '统计排除的子任务',
    parentId: statsTasks[0].id,
  };
  const seed = async (tasks, route) => {
    const snapshot = { schemaVersion: 1, projects, tasks };
    await evaluate(
      `localStorage.setItem('taskflow_v1_data', ${JSON.stringify(JSON.stringify(snapshot))}); location.hash=${JSON.stringify(route)};`
    );
    await reload(route === '/stats' ? '数据统计' : '任务看板');
    await ready();
    return JSON.stringify(snapshot);
  };
  const ready = () =>
    until(
      () =>
        evaluate(
          `!!(${taskStore}) && !!(${projectStore}) && !(${taskStore}).loading && !(${projectStore}).loading && !!document.querySelector('.project-select .el-select__wrapper:not(.is-disabled)')`
        ),
      '页面查询结束'
    );
  const selectProject = async (scope, name) => {
    await ready();
    const selector = `${scope} .project-select .el-select__wrapper`;
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const option = `[...document.querySelectorAll('.el-select-dropdown__item')].find(item => item.getClientRects().length && item.textContent.trim() === ${JSON.stringify(name)})`;
    await until(() => evaluate(`!!(${option})`), `项目选项${name}`);
    await evaluate(`(${option}).click()`);
    await ready();
  };
  const go = async (route, title) => {
    await evaluate(`document.querySelector('a[href="#${route}"]').click()`);
    await shown(title);
    const page = {
      '/task-list': '.task-list-page',
      '/kanban': '.kanban-page',
      '/stats': '.stats-page',
    }[route];
    assert(page, '导航验收须指定目标页面容器');
    await until(
      () => evaluate(`!!document.querySelector(${JSON.stringify(page)})`),
      '目标懒加载页面实际挂载'
    );
    await ready();
  };
  const checkStats = async (roots, projectId) => {
    const selected = roots.filter((task) => !projectId || task.projectId === projectId);
    const done = selected.filter((task) => task.status === 'done').length;
    const summary = [
      String(selected.length),
      String(done),
      `${selected.length ? Math.round((done / selected.length) * 100) : 0}%`,
    ];
    await until(
      async () =>
        JSON.stringify(
          await evaluate(
            "[...document.querySelectorAll('.stats-page .el-descriptions__content')].map(item => item.textContent.trim())"
          )
        ) === JSON.stringify(summary),
      '页面汇总与项目一致'
    );
    assert.equal(
      await evaluate("document.querySelector('.charts-container').getClientRects().length > 0"),
      true
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.chart-box canvas').length"),
      2,
      '两个图表均已实际创建'
    );
    assert.deepEqual(
      await evaluate(`(${taskStore}).statusCounts.map(item => item.value)`),
      ['todo', 'doing', 'done'].map(
        (status) => selected.filter((task) => task.status === status).length
      )
    );
    assert.deepEqual(
      await evaluate(`(${taskStore}).priorityCounts`),
      ['low', 'medium', 'high'].map(
        (priority) => selected.filter((task) => task.priority === priority).length
      )
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-empty')].some(item => item.getClientRects().length > 0)"
      ),
      selected.length === 0
    );
  };
  const trackWrites = () =>
    evaluate(`window.stage4Writes=0; window.stage4Attempts=0; window.stage4DenyWrite=false; window.stage4Set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){ if(key==='taskflow_v1_data'){window.stage4Attempts++;if(window.stage4DenyWrite)throw new DOMException('quota','QuotaExceededError');} const result=window.stage4Set.call(this,key,value); if(key==='taskflow_v1_data')window.stage4Writes++; return result; };
    window.stage4Get=Storage.prototype.getItem; window.stage4DenyRead=false; Storage.prototype.getItem=function(key){if(key==='taskflow_v1_token'&&window.stage4DenyRead)throw new Error('stage4 read denied');return window.stage4Get.call(this,key);};`);
  const retryTwice = async () => {
    await evaluate(`(() => { window.stage4ProjectQueries=0; window.stage4OriginalProjectQuery=(${projectStore}).fetchProjects;
      (${projectStore}).fetchProjects=(...args)=>{window.stage4ProjectQueries++;return window.stage4OriginalProjectQuery(...args);};
      const button=[...document.querySelectorAll('.el-alert button')].find(item=>item.textContent.trim()==='重试');button.click();button.click(); })()`);
    await ready();
    assert.equal(await evaluate('window.stage4ProjectQueries'), 1, '连续点击重试只启动一次查询');
    await evaluate(`(${projectStore}).fetchProjects=window.stage4OriginalProjectQuery`);
  };
  const noOverflow = async () =>
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      '没有横向溢出'
    );

  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const original = await seed([...statsTasks, child], '/stats');
    await trackWrites();
    for (const project of [...projects, { id: '', name: '全部项目' }]) {
      await selectProject('.stats-page', project.name);
      await checkStats(statsTasks, project.id);
      assert.equal(await readData(), original);
      assert.equal(await evaluate('window.stage4Writes'), 0);
    }
    await selectProject('.stats-page', projectNames[1]);
    await checkStats(statsTasks, projects[1].id);
    await noOverflow();
    // 等待 ECharts 的正常过渡动画结束，再检查实际画布的提示内容及截图。
    await delay(1200);
    const piePoint = await evaluate(
      "(() => {const element=document.querySelectorAll('.chart-box')[0];element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2+10,y:rect.y+rect.height/2+20};})()"
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...piePoint });
    await until(
      () => evaluate("/已完成\\s*2/.test(document.querySelectorAll('.chart-box')[0].innerText)"),
      '饼图实际提示已完成2条'
    );
    const barPoint = await evaluate(
      "(() => {const element=document.querySelectorAll('.chart-box')[1];element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width*(0.1+0.8/6),y:rect.y+rect.height/2};})()"
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...barPoint });
    await until(
      () => evaluate("/低[\\s\\S]*1/.test(document.querySelectorAll('.chart-box')[1].innerText)"),
      '柱图实际提示低优先级1条'
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width - 5, y: 5 });
    await delay(250);
    await evaluate('window.scrollTo(0,0)');
    await capture(`STATS_${width}_2026-11-03.png`);
    await go('/task-list', '新增任务');
    assert(
      (await evaluate("document.querySelector('.page-header p').textContent")).includes(
        '共 2 个任务'
      )
    );
    await go('/kanban', '任务看板');
    assert.equal(await evaluate("document.querySelectorAll('.task-card').length"), 2);
    await go('/stats', '数据统计');
    await checkStats(statsTasks, projects[1].id);
    console.log(
      `PASS: ${width}px 统计A/B/空/全部为101/2/0/103条、33%/100%/0%/34%，排除子任务，状态/优先级计数一致；真实画布提示已完成2条/低优先级1条；三页项目联动、零写入、无横向溢出`
    );

    // 查询失败后隐藏旧图表及汇总，连续重试只查询一次。
    await evaluate('window.stage4DenyRead=true');
    await selectProject('.stats-page', projectNames[0]);
    await shown('统计数据加载失败');
    assert.equal(
      await evaluate("document.querySelector('.charts-container').getClientRects().length"),
      0
    );
    assert.equal(
      await evaluate("document.querySelector('.el-descriptions').getClientRects().length"),
      0
    );
    assert.equal(await readData(), original);
    await click('重试');
    await ready();
    await shown('统计数据加载失败');
    await evaluate('window.stage4DenyRead=false');
    await retryTwice();
    await checkStats(statsTasks, projects[0].id);
    assert.equal(await evaluate('window.stage4Writes'), 0);
    await reload('数据统计');
    await ready();
    await checkStats(statsTasks, '');
    assert.equal(await readData(), original);
    console.log(
      `PASS: ${width}px 统计查询失败隐藏旧图表与汇总，再失败保留重试；恢复后连续重试无重复查询，刷新保留快照并恢复全部项目`
    );

    await trackWrites();
    await go('/task-list', '新增任务');
    await selectProject('.task-list-page', projectNames[0]);
    const expectList = async (total, page = 1) => {
      await until(
        () =>
          evaluate(
            `!(${taskStore}).loading && (${taskStore}).total === ${total} && (${taskStore}).query.page === ${page}`
          ),
        `列表${total}条/第${page}页`
      );
      assert(
        (await evaluate("document.querySelector('.page-header p').textContent")).includes(
          `共 ${total} 个任务`
        )
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.el-table__body-wrapper .el-table__row').length"
        ),
        Math.min(10, Math.max(0, total - (page - 1) * 10))
      );
    };
    const selectStatus = async (name) => {
      await evaluate("document.querySelector('.status-select .el-select__wrapper').click()");
      const option = `[...document.querySelectorAll('.el-select-dropdown__item')].find(item=>item.getClientRects().length && item.textContent.trim()===${JSON.stringify(name)})`;
      await until(() => evaluate(`!!(${option})`), `状态选项${name}`);
      await evaluate(`(${option}).click()`);
      await ready();
    };
    await expectList(101);
    await evaluate("document.querySelector('.el-pagination .btn-next').click()");
    await expectList(101, 2);
    await evaluate(
      "[...document.querySelectorAll('.el-pager .number')].find(item=>item.textContent.trim()==='11').click()"
    );
    await expectList(101, 11);
    assert(
      (
        await evaluate("document.querySelector('.el-table__body-wrapper .el-table__row').innerText")
      ).includes('联动任务101')
    );

    await browser.fill('.search-input input', '  联动任务101  ');
    await until(
      () => evaluate(`(${taskStore}).query.keyword === '联动任务101'`),
      '搜索防抖及首尾空格处理'
    );
    await expectList(1);
    await selectStatus('已完成');
    await expectList(0);
    await selectStatus('进行中');
    await expectList(1);
    await browser.fill('.search-input input', '');
    await until(() => evaluate(`(${taskStore}).query.keyword === ''`), '清空搜索提交');
    await expectList(34);
    await evaluate("document.querySelector('.el-pagination .btn-next').click()");
    await expectList(34, 2);
    await selectStatus('待办');
    await expectList(34);
    await selectProject('.task-list-page', projectNames[1]);
    await expectList(0);
    await go('/stats', '数据统计');
    await checkStats(statsTasks, projects[1].id);
    await go('/kanban', '任务看板');
    assert.equal(
      await evaluate("document.querySelectorAll('.task-card').length"),
      2,
      '看板只按项目汇总，不误用列表的待办筛选'
    );
    await go('/task-list', '新增任务');
    await expectList(0);
    await selectProject('.task-list-page', projectNames[0]);
    await expectList(34);

    await evaluate(
      `window.stage4ListCalls=0;window.stage4OriginalList=(${taskStore}).fetchTasks;(${taskStore}).fetchTasks=(...args)=>{window.stage4ListCalls++;return window.stage4OriginalList(...args);};`
    );
    await browser.fill('.search-input input', '离开页面不应提交');
    await go('/stats', '数据统计');
    await delay(400);
    assert.equal(await evaluate('window.stage4ListCalls'), 0, '卸载清理尚未触发的搜索防抖');
    assert.equal(await evaluate(`(${taskStore}).query.keyword`), '');
    await checkStats(statsTasks, projects[0].id);
    await go('/task-list', '新增任务');
    await expectList(34);
    await evaluate('window.stage4DenyRead=true');
    await selectStatus('进行中');
    await shown('任务加载失败');
    assert.equal(
      await evaluate("document.querySelectorAll('.el-table__row').length"),
      0,
      '失败隐藏旧表格'
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.el-pagination').length"),
      0,
      '失败隐藏旧分页'
    );
    await evaluate('window.stage4DenyRead=false;window.stage4ListCalls=0');
    await evaluate(
      "(() => {const button=[...document.querySelectorAll('.el-alert button')].find(item=>item.textContent.trim()==='重试');button.click();button.click();})()"
    );
    await ready();
    await expectList(34);
    assert.equal(await evaluate('window.stage4ListCalls'), 1, '列表连续重试只发一次查询');
    await evaluate(`(${taskStore}).fetchTasks=window.stage4OriginalList`);
    assert.equal(await evaluate('window.stage4Writes'), 0);
    assert.equal(await readData(), original);
    await noOverflow();

    // 模拟列表尚在查询时切换到新页面，缓存预先保留另一个项目的数据。
    for (const [route, title] of [
      ['/stats', '数据统计'],
      ['/kanban', '任务看板'],
    ]) {
      await go('/stats', '数据统计');
      await selectProject('.stats-page', projectNames[0]);
      await checkStats(statsTasks, projects[0].id);
      await go('/task-list', '新增任务');
      await selectProject('.task-list-page', projectNames[1]);
      await expectList(0);
      await evaluate(`window.stage4HeldOriginal=(${taskStore}).fetchTasks;
        window.stage4Gate=new Promise(resolve=>{window.stage4Release=resolve});
        (${taskStore}).fetchTasks=async(...args)=>{(${taskStore}).loading=true;await window.stage4Gate;return window.stage4HeldOriginal(...args);};
        window.stage4HeldQuery=(${taskStore}).fetchTasks();void 0;`);
      await evaluate(`document.querySelector('a[href="#${route}"]').click()`);
      await shown(title);
      await delay(100);
      await evaluate('window.stage4Release();window.stage4HeldQuery');
      await evaluate(`(${taskStore}).fetchTasks=window.stage4HeldOriginal`);
      await ready();
      assert.equal(
        await evaluate(`(${taskStore}).allTasks.length`),
        2,
        '跨路由加载不能因旧页面busy而跳过新页面查询'
      );
      if (route === '/stats') await checkStats(statsTasks, projects[1].id);
      else assert.equal(await evaluate("document.querySelectorAll('.task-card').length"), 2);
    }
    console.log(
      `PASS: ${width}px 列表请求未完成时进入统计/看板，新页面仍加载当前项目，不展示其他项目旧缓存`
    );
    await go('/task-list', '新增任务');
    await reload('新增任务');
    await ready();
    await expectList(103);
    assert.equal(await readData(), original);
    console.log(
      `PASS: ${width}px 列表第2/11页、搜索trim及回首页、项目/状态组合与清空、零结果、卸载防抖取消、失败隐藏旧表格及分页、连续重试防重复、刷新保留快照全部通过`
    );
  }

  // 用少量任务保证手机单列布局中的源卡片和目标列均能操作。
  const dragTasks = [
    makeTask(0, 0, 'todo', '可拖拽任务'),
    makeTask(1, 0, 'todo', '有未完成子任务的父任务'),
    makeTask(2, 0, 'doing', '进行中任务'),
    makeTask(3, 0, 'done', '已完成任务'),
    makeTask(4, 1, 'done', '其他项目任务'),
  ];
  const dragChild = {
    ...dragTasks[1],
    id: '1800000010901',
    title: '未完成子任务',
    parentId: dragTasks[1].id,
    status: 'todo',
  };
  const cardStatus = async (title) =>
    evaluate(
      `(() => {const columns=[...document.querySelectorAll('.kanban-column')];return columns.findIndex(column=>[...column.querySelectorAll('.task-card-title')].some(item=>item.textContent.trim()===${JSON.stringify(title)}));})()`
    );
  const drag = async (title, columnIndex) => {
    await ready();
    await until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.el-loading-mask, .el-select-dropdown')].every(item=>item.getClientRects().length===0)"
        ),
      '加载遮罩和下拉菜单关闭'
    );
    await interceptDrag();
    const points = await evaluate(
      `(() => { const source=[...document.querySelectorAll('.task-card')].find(item=>item.querySelector('.task-card-title').textContent.trim()===${JSON.stringify(title)});source.scrollIntoView({block:'center'}); const from=source.getBoundingClientRect(); const target=document.querySelectorAll('.task-list')[${columnIndex}];const to=target.getBoundingClientRect();return {from:{x:from.x+from.width/2,y:from.y+Math.min(from.height/2,20)},to:{x:to.x+to.width/2,y:to.y+Math.min(to.height-12,45)}};})()`
    );
    assert(points.to.y > 0 && points.to.y < 1100, '目标列在可操作视口中');
    assert.equal(
      await evaluate(
        `document.elementFromPoint(${points.from.x},${points.from.y})?.closest('.task-card')?.querySelector('.task-card-title')?.textContent.trim()`
      ),
      title,
      '拖拽起点没有被遮罩或下拉菜单覆盖'
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...points.from,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let index = 1; index <= 12; index++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: points.from.x + ((points.to.x - points.from.x) * index) / 12,
        y: points.from.y + ((points.to.y - points.from.y) * index) / 12,
        button: 'left',
        buttons: 1,
      });
      await delay(25);
    }
    await until(() => dragData() !== null, '原生拖拽开始');
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await send('Input.dispatchDragEvent', { type, ...points.to, data: dragData() });
      await delay(100);
    }
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...points.to,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await delay(300);
    await ready();
  };
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const original = await seed([...dragTasks, dragChild], '/kanban');
    await selectProject('.kanban-page', projectNames[0]);
    await trackWrites();

    await evaluate('window.stage4DenyRead=true');
    await selectProject('.kanban-page', projectNames[1]);
    await shown('看板数据加载失败，请重试');
    assert.equal(await evaluate("document.querySelectorAll('.kanban-column').length"), 0);
    assert.equal(await readData(), original);
    await click('重试');
    await ready();
    await shown('看板数据加载失败，请重试');
    await evaluate('window.stage4DenyRead=false');
    await retryTwice();
    assert.equal(await evaluate("document.querySelectorAll('.task-card').length"), 1);
    assert.equal(await evaluate('window.stage4Writes'), 0);
    await selectProject('.kanban-page', projectNames[0]);

    await drag('可拖拽任务', 1);
    await until(
      async () =>
        (await readSnapshot()).tasks.find((task) => task.id === dragTasks[0].id).status === 'doing',
      '鼠标拖拽状态保存'
    );
    assert.equal(await cardStatus('可拖拽任务'), 1);
    assert.equal(await evaluate('window.stage4Writes'), 1);
    let saved = await readData();

    await evaluate('window.stage4DenyWrite=true');
    await drag('可拖拽任务', 2);
    await shown('存储写入失败');
    await until(async () => (await cardStatus('可拖拽任务')) === 1, '写失败回到进行中列');
    assert.equal(await readData(), saved);
    assert.equal(await evaluate('window.stage4Writes'), 1);
    await evaluate('window.stage4DenyWrite=false');

    await drag('有未完成子任务的父任务', 2);
    await shown('存在未完成子任务');
    await until(
      async () => (await cardStatus('有未完成子任务的父任务')) === 0,
      '业务拒绝后回到待办列'
    );
    assert.equal(await readData(), saved);
    assert.equal(await evaluate('window.stage4Writes'), 1);

    // PUT 成功后让 token 读取失败，真正触发后续 GET 的失败分支。
    await evaluate(`window.stage4UpdateCalls=0;window.stage4UpdateOriginal=(${taskStore}).updateStatus;
      (${taskStore}).updateStatus=async(...args)=>{window.stage4UpdateCalls++;const result=await window.stage4UpdateOriginal(...args);window.stage4DenyRead=true;return result;};`);
    await drag('可拖拽任务', 2);
    await shown('看板数据加载失败，请重试');
    assert.equal(
      (await readSnapshot()).tasks.find((task) => task.id === dragTasks[0].id).status,
      'done'
    );
    assert.equal(await evaluate('window.stage4Writes'), 2);
    assert.equal(await evaluate('window.stage4UpdateCalls'), 1);
    saved = await readData();
    await evaluate('window.stage4DenyRead=false');
    await retryTwice();
    assert.equal(await cardStatus('可拖拽任务'), 2);
    assert.equal(await readData(), saved);
    assert.equal(await evaluate('window.stage4Writes'), 2);
    assert.equal(await evaluate('window.stage4UpdateCalls'), 1, '查询重试不能再次保存状态');
    await go('/stats', '数据统计');
    const savedRoots = (await readSnapshot()).tasks.filter((task) => task.parentId === null);
    await checkStats(savedRoots, projects[0].id);
    await reload('数据统计');
    await ready();
    await checkStats(savedRoots, '');
    assert.equal(await readData(), saved);
    await noOverflow();
    for (const [route, title] of [
      ['/kanban', '任务看板'],
      ['/stats', '数据统计'],
      ['/task-list', '新增任务'],
    ]) {
      await evaluate('document.querySelector(\'a[href="#/projects"]\').click()');
      await shown('新增项目');
      await until(() => evaluate(`!(${projectStore}).loading`), '项目页加载完成');
      await evaluate(`window.stage4LeftQueries=0;window.stage4HeldOnce=false;window.stage4ReleaseLeft=null;
        window.stage4OldProjects=(${projectStore}).fetchProjects;
        window.stage4OldAll=(${taskStore}).fetchAllTasks;window.stage4OldList=(${taskStore}).fetchTasks;
        (${taskStore}).fetchAllTasks=(...args)=>{window.stage4LeftQueries++;return window.stage4OldAll(...args);};
        (${taskStore}).fetchTasks=(...args)=>{window.stage4LeftQueries++;return window.stage4OldList(...args);};
        (${projectStore}).fetchProjects=async(...args)=>{const result=await window.stage4OldProjects(...args);if(!window.stage4HeldOnce){window.stage4HeldOnce=true;await new Promise(resolve=>window.stage4ReleaseLeft=resolve);}return result;};`);
      await evaluate(`document.querySelector('a[href="#${route}"]').click()`);
      await shown(title);
      await until(
        () => evaluate("typeof window.stage4ReleaseLeft === 'function'"),
        '挂载查询进入延迟'
      );
      await evaluate('document.querySelector(\'a[href="#/projects"]\').click()');
      await shown('新增项目');
      await evaluate('window.stage4ReleaseLeft();void 0');
      await delay(100);
      assert.equal(await evaluate('window.stage4LeftQueries'), 0, '页面卸载后不能继续启动任务查询');
      await evaluate(
        `(${projectStore}).fetchProjects=window.stage4OldProjects;(${taskStore}).fetchAllTasks=window.stage4OldAll;(${taskStore}).fetchTasks=window.stage4OldList`
      );
      assert.equal(await readData(), saved);
    }
    await go('/stats', '数据统计');
    await checkStats(savedRoots, '');
    console.log(
      `PASS: ${width}px 列表/看板/统计在挂载项目查询延迟时离开，恢复旧请求后均不继续查询任务，快照不变`
    );
    console.log(
      `PASS: ${width}px 实际鼠标拖拽单次保存，写失败回滚、未完成子任务阻止父任务完成；保存成功/刷新失败分开，重试只读不重复保存，统计与刷新结果一致`
    );
  }
}
