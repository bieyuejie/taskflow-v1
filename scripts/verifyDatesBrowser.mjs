import assert from 'node:assert/strict';

export async function verifyDatesBrowser(browser) {
  const { evaluate, send, shown, click, fill, readData, readSnapshot, reload, until, patchWrite } =
    browser;
  await fill('input[placeholder="请输入账号"]', 'stage3-dates');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  const initial = await readSnapshot();
  const dialogOpen = () =>
    evaluate("[...document.querySelectorAll('.el-dialog')].some(d => d.getClientRects().length)");
  const closed = () => until(async () => !(await dialogOpen()), '任务弹窗关闭');
  const dateInput = '.el-dialog .date-input input';
  const localDates = () =>
    evaluate(`(() => {
    const format = date => { const parts = new Intl.DateTimeFormat('en-US', {year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('-'); };
    const today = new Date(); const yesterday = new Date(today); yesterday.setDate(today.getDate()-1); const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
    return {today:format(today), yesterday:format(yesterday), tomorrow:format(tomorrow)};
  })()`);
  const chooseDate = async (target, today) => {
    const current =
      (await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`)) || today;
    await until(
      () => evaluate("!document.querySelector('[class*=dialog-fade-enter]')"),
      '弹窗过渡完成'
    );
    const point = await evaluate(
      "(() => { const r = document.querySelector('.el-dialog .date-input .el-input__prefix').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()"
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    const panel =
      "[...document.querySelectorAll('.el-picker-panel')].find(p => p.getClientRects().length)";
    await until(() => evaluate(`!!(${panel})`), '日历打开');
    const monthNumber = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
    const difference = monthNumber(target) - monthNumber(current);
    for (let index = 0; index < Math.abs(difference); index++) {
      const before = await evaluate(
        `(${panel}).querySelector('.el-date-picker__header').innerText`
      );
      await evaluate(
        `(${panel}).querySelector('button.${difference < 0 ? 'arrow-left' : 'arrow-right'}').click()`
      );
      await until(
        () =>
          evaluate(
            `(${panel}).querySelector('.el-date-picker__header').innerText !== ${JSON.stringify(before)}`
          ),
        '日历切换月份'
      );
    }
    await evaluate(
      `(() => { const panel = ${panel}; const day = ${Number(target.slice(8))}; const cell = [...panel.querySelectorAll('.el-date-table td')].find(td => !td.classList.contains('prev-month') && !td.classList.contains('next-month') && td.textContent.trim() === String(day)); if (!cell) throw new Error('找不到日期单元格'); cell.querySelector('.el-date-table-cell').click(); })()`
    );
    await until(
      () =>
        evaluate(
          `document.querySelector(${JSON.stringify(dateInput)}).value === ${JSON.stringify(target)}`
        ),
      '选择日期回填'
    );
  };
  const clearDate = async () => {
    await evaluate(
      "document.querySelector('.el-dialog .date-input').dispatchEvent(new MouseEvent('mouseenter'))"
    );
    await until(
      () => evaluate("!!document.querySelector('.el-dialog .date-input .clear-icon')"),
      '日期清除入口'
    );
    await evaluate("document.querySelector('.el-dialog .date-input .clear-icon').click()");
    await until(
      () => evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value === ''`),
      '清除日期'
    );
  };
  const edit = async (title) => {
    await evaluate(
      `(() => { const row = [...document.querySelectorAll('.task-list-page .el-table__row')].find(row => row.innerText.includes(${JSON.stringify(title)})); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑').click(); })()`
    );
    await until(dialogOpen, '编辑任务');
  };
  const rowText = (title) =>
    evaluate(
      `[...document.querySelectorAll('.task-list-page .el-table__row')].find(row => row.innerText.includes(${JSON.stringify(title)}))?.innerText`
    );

  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    await send('Emulation.setTimezoneOverride', {
      timezoneId: width === 375 ? 'Asia/Shanghai' : 'America/Los_Angeles',
    });
    await reload('新增任务');
    const dates = await localDates();
    const title = '日期页面验收-' + width;
    await click('新增任务');
    await until(dialogOpen, '新增任务');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`), '');
    assert.equal(
      await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).readOnly`),
      true,
      '通过日历选择有效日期'
    );
    await chooseDate(dates.yesterday, dates.today);
    await click('取消');
    await closed();
    await click('新增任务');
    await until(dialogOpen, '重新新增');
    assert.equal(
      await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
      '',
      '取消后新表单日期重置'
    );
    await chooseDate(dates.yesterday, dates.today);
    await click('确定');
    await shown('请输入标题');
    assert.equal(
      (await readSnapshot()).tasks.some((task) => task.title === title),
      false
    );
    await fill('.el-dialog input', title);
    const before = await readData();
    if (width === 1280) {
      await patchWrite('taskflow_v1_data');
      await click('确定');
      await shown('存储写入失败');
      await until(
        () => evaluate("!document.querySelector('.el-dialog input').disabled"),
        '写失败恢复输入'
      );
      assert.equal(await readData(), before);
      assert.equal(
        await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
        dates.yesterday
      );
      assert.equal(await evaluate("document.querySelector('.el-dialog input').value"), title);
      await evaluate('Storage.prototype.setItem = window.restoreSet');
    }
    await evaluate(
      "(() => { const button = [...document.querySelectorAll('.el-dialog button')].find(b=>b.textContent.trim()==='确定'); button.click(); button.click(); })()"
    );
    await closed();
    await shown(title);
    const created = (await readSnapshot()).tasks.find((task) => task.title === title);
    assert.equal(created.dueDate, dates.yesterday);
    assert.equal((await readSnapshot()).tasks.filter((task) => task.title === title).length, 1);
    assert((await rowText(title)).includes('已逾期'));
    await reload(title);
    await edit(title);
    assert.equal(
      await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
      dates.yesterday
    );
    await clearDate();
    if (width === 1280) {
      const raw = await readData();
      await patchWrite('taskflow_v1_data');
      await click('确定');
      await shown('存储写入失败');
      await until(
        () => evaluate("!document.querySelector('.el-dialog input').disabled"),
        '编辑失败恢复'
      );
      assert.equal(await readData(), raw);
      assert.equal(
        await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
        ''
      );
      await evaluate('Storage.prototype.setItem = window.restoreSet');
    }
    await click('确定');
    await closed();
    await reload(title);
    assert.equal((await readSnapshot()).tasks.find((task) => task.id === created.id).dueDate, null);
    assert((await rowText(title)).includes('未设置'));
    await edit(title);
    await chooseDate(dates.today, dates.today);
    await click('确定');
    await closed();
    assert(!(await rowText(title)).includes('已逾期'), '截止当天不算逾期');
    await edit(title);
    await chooseDate(dates.tomorrow, dates.today);
    await click('确定');
    await closed();
    await reload(title);
    await edit(title);
    assert.equal(
      await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
      dates.tomorrow
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog')].filter(d=>d.getClientRects().length).every(d=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth)"
      ),
      true
    );
    await click('取消');
    await closed();
    const saved = (await readSnapshot()).tasks.find((task) => task.id === created.id);
    assert.equal(saved.id, created.id);
    assert.equal(saved.createTime, created.createTime);
    console.log(
      `PASS: ${width}px日历选择、默认/取消重置、创建/编辑/清除/回填/刷新、当天不逾期及布局`
    );
  }

  const early = await readSnapshot();
  const earlyTask = early.tasks.find((task) => task.parentId === null);
  earlyTask.dueDate = '0004-02-29';
  await evaluate(
    `localStorage.setItem('taskflow_v1_data', ${JSON.stringify(JSON.stringify(early))})`
  );
  await reload('新增任务');
  await edit(earlyTask.title);
  assert.equal(
    await evaluate(`document.querySelector(${JSON.stringify(dateInput)}).value`),
    '0004-02-29'
  );
  await click('确定');
  await closed();
  assert.equal(
    (await readSnapshot()).tasks.find((task) => task.id === earlyTask.id).dueDate,
    '0004-02-29'
  );
  console.log('PASS: 0004年闰日实际表单回填及保存不变，不映射到1904年');

  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    const dates = await localDates();
    const fixture = structuredClone(initial);
    let id = Date.now() + 10000;
    const project = {
      id: String(id++),
      name: '逾期筛选第二项目',
      desc: '',
      createTime: Date.now(),
    };
    fixture.projects.push(project);
    fixture.tasks = [];
    const make = (title, dueDate, status = 'todo', projectId = fixture.projects[0].id) => ({
      id: String(id++),
      title,
      desc: '',
      status,
      priority: 'low',
      createTime: Date.now(),
      projectId,
      parentId: null,
      dueDate,
    });
    for (let index = 0; index < 12; index++)
      fixture.tasks.push(make('筛选甲逾期' + index, dates.yesterday, index % 2 ? 'doing' : 'todo'));
    fixture.tasks.push(
      make('筛选甲当天', dates.today),
      make('筛选甲未来', dates.tomorrow),
      make('筛选甲完成', dates.yesterday, 'done'),
      make('筛选甲无日期', null)
    );
    const other = make('筛选乙逾期', dates.yesterday, 'todo', project.id);
    fixture.tasks.push(other);
    fixture.tasks.push({
      ...other,
      id: String(id++),
      title: '筛选乙子任务',
      parentId: other.id,
      dueDate: null,
    });
    await evaluate(
      `localStorage.setItem('taskflow_v1_data', ${JSON.stringify(JSON.stringify(fixture))})`
    );
    await reload('新增任务');
    const raw = await readData();
    const checkRows = async (total) => {
      await until(
        () =>
          evaluate(
            `document.querySelector('.page-header p')?.textContent.includes('共 ${total} 个任务')`
          ),
        '筛选总数' + total
      );
      await until(
        () =>
          evaluate(
            "!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task').loading"
          ),
        '筛选结束'
      );
    };
    await evaluate("document.querySelector('.el-pagination .btn-next').click()");
    await checkRows(17);
    await evaluate("document.querySelector('.toolbar input[type=checkbox]').click()");
    await checkRows(13);
    assert.equal(
      await evaluate(
        "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task').query.page"
      ),
      1
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.task-list-page .el-table__row')].every(row=>row.innerText.includes('已逾期'))"
      ),
      true
    );
    const selectOption = async (selector, name) => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      const option = `[...document.querySelectorAll('.el-select-dropdown__item')].find(o=>o.getClientRects().length && o.textContent.trim()===${JSON.stringify(name)})`;
      await until(() => evaluate(`!!(${option})`), '选项' + name);
      await evaluate(`(${option}).click()`);
    };
    await selectOption('.toolbar .project-select .el-select__wrapper', project.name);
    await checkRows(1);
    await fill('.search-input input', '筛选乙');
    await until(
      () =>
        evaluate(
          "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task').query.keyword === '筛选乙'"
        ),
      '搜索防抖提交'
    );
    await checkRows(1);
    await selectOption('.status-select .el-select__wrapper', '待办');
    await checkRows(1);
    assert.equal(
      await evaluate(
        "document.querySelector('.task-list-page .el-table__row').innerText.includes('筛选乙逾期')"
      ),
      true
    );
    assert.equal(await readData(), raw, '筛选不能写入快照');
    await click('退出登录');
    await shown('演示环境');
    await fill('input[placeholder="请输入账号"]', 'stage3-dates');
    await fill('input[placeholder="请输入密码"]', 'demo');
    await click('登录');
    await shown('新增任务');
    await checkRows(17);
    assert.equal(
      await evaluate("document.querySelector('.toolbar input[type=checkbox]').checked"),
      false
    );
    assert.equal(await readData(), raw);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    console.log(
      `PASS: ${width}px逾期筛选/回第一页/项目关键词状态组合，排除当天/完成/子任务，退出复位且筛选零写入`
    );
  }
}
