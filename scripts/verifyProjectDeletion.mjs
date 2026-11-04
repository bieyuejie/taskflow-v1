import assert from 'node:assert/strict';

// 由 verifyBrowser.mjs 调用，只使用该脚本创建的独立临时浏览器配置。
export async function verifyProjectDeletion(browser) {
  const { evaluate, send, shown, click, fill, readData, readSnapshot, reload, until, patchWrite } =
    browser;

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('taskflow_v1_data'));
    const project = snapshot.projects[0];
    const parent = snapshot.tasks.find(task => task.projectId === project.id && task.status === 'todo');
    if (!parent) throw new Error('删除验收需要一个待办父任务');
    let nextId = Math.max(Date.now(), ...[...snapshot.projects, ...snapshot.tasks].map(item => Number(item.id))) + 1;
    const kept = { id: String(nextId++), name: '删除验收保留项目', desc: '', createTime: Date.now() };
    const empty = { id: String(nextId++), name: '删除验收空项目', desc: '', createTime: Date.now() };
    snapshot.projects.push(kept, empty);
    for (let index = 0; index < 2; index++) {
      snapshot.tasks.push({ ...parent, id: String(nextId++), title: '待级联子任务' + index, parentId: parent.id, dueDate: null, createTime: Date.now() });
    }
    const other = { ...parent, id: String(nextId++), title: '其他项目父任务', projectId: kept.id, parentId: null, createTime: Date.now() };
    snapshot.tasks.push(other, { ...other, id: String(nextId++), title: '其他项目子任务', parentId: other.id, createTime: Date.now() });
    localStorage.setItem('taskflow_v1_data', JSON.stringify(snapshot));
    location.hash = '/projects';
  })()`);
  await reload('删除验收保留项目');
  const initial = await readSnapshot();
  const target = initial.projects[0];
  const kept = initial.projects.find((project) => project.name === '删除验收保留项目');
  const affected = initial.tasks.filter((task) => task.projectId === target.id);
  const rootCount = affected.filter((task) => task.parentId === null).length;
  const original = await readData();

  const boxOpen = () =>
    evaluate(
      "[...document.querySelectorAll('.el-message-box')].some(box => box.getClientRects().length)"
    );
  const waitClosed = () => until(async () => !(await boxOpen()), '删除确认框关闭');
  const waitReady = () =>
    until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.projects-page button')].every(button => !button.disabled)"
        ),
      '删除操作结束后恢复按钮'
    );
  const askDelete = async (name, repeat = false) => {
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.el-table__row')].find(item => item.querySelector('td')?.innerText.trim() === ${JSON.stringify(name)});
      const button = [...row.querySelectorAll('button')].find(item => item.textContent.trim() === '删除');
      button.click();
      if (${repeat}) button.click();
    })()`);
  };
  const assertCounts = async (roots, children) => {
    await until(boxOpen, '删除数量确认');
    const message = await evaluate("document.querySelector('.el-message-box').innerText");
    assert(message.includes(`${roots} 个顶层任务和 ${children} 个子任务`));
    assert(!message.includes('${'), '确认框必须显示实际名称和数量');
  };

  await askDelete(target.name, true);
  await assertCounts(rootCount, 2);
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.projects-page button')].every(button => button.disabled)"
    ),
    true,
    '确认期间禁用新增、编辑和删除'
  );
  assert.equal(await readData(), original);
  await click('取消');
  await waitClosed();
  await waitReady();
  assert.equal(await readData(), original);
  console.log('PASS: 项目删除显示实际顶层/子任务数量，重复点击受阻，取消不写入并恢复按钮');

  await evaluate(`window.originalGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key === 'taskflow_v1_token') throw new Error('read denied');
      return window.originalGet.call(this, key);
    };`);
  await askDelete(target.name);
  await shown('无法读取浏览器存储');
  await waitReady();
  assert.equal(await boxOpen(), false);
  assert.equal(await readData(), original);
  await evaluate('Storage.prototype.getItem = window.originalGet');
  console.log('PASS: 删除数量查询失败时不弹确认框、不删除数据，按钮恢复后可重试');

  await patchWrite('taskflow_v1_data');
  await askDelete(target.name);
  await assertCounts(rootCount, 2);
  await click('确认删除');
  await shown('存储写入失败');
  await waitClosed();
  await waitReady();
  assert.equal(await readData(), original);
  assert.equal(
    await evaluate(
      `document.querySelector('.el-table').innerText.includes(${JSON.stringify(target.name)})`
    ),
    true
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.el-message')].some(message => message.textContent.includes('项目删除成功'))"
    ),
    false
  );
  await evaluate(`Storage.prototype.setItem = window.restoreSet;
    window.deleteWrites = 0;
    window.countedSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'taskflow_v1_data') window.deleteWrites++;
      return window.countedSet.call(this, key, value);
    };`);
  await askDelete(target.name, true);
  await assertCounts(rootCount, 2);
  await click('确认删除');
  await shown('项目删除成功');
  await waitClosed();
  await waitReady();
  assert.equal(await evaluate('window.deleteWrites'), 1);
  const deleted = await readSnapshot();
  assert.equal(deleted.projects.length, initial.projects.length - 1);
  assert(!deleted.projects.some((project) => project.id === target.id));
  assert.deepEqual(
    deleted.tasks,
    initial.tasks.filter((task) => task.projectId !== target.id)
  );
  await reload('删除验收保留项目');
  assert.deepEqual(await readSnapshot(), deleted);
  console.log(
    'PASS: 写入失败保留项目和任务、不报假成功；重试单次写入、级联删除且刷新保留，其他项目任务不变'
  );

  for (const width of [375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    let name = '删除验收空项目';
    if (width === 768) {
      name = '768px删除验收';
      await click('新增项目');
      await until(() => evaluate("!!document.querySelector('.el-dialog input')"), '新增验收项目');
      await fill('.el-dialog input', name);
      await click('保存');
      await until(
        async () => (await readSnapshot()).projects.some((project) => project.name === name),
        '验收项目保存'
      );
      await until(
        () =>
          evaluate(
            "[...document.querySelectorAll('.el-dialog')].every(dialog => !dialog.getClientRects().length)"
          ),
        '新增项目弹窗关闭'
      );
    }
    await askDelete(name);
    await assertCounts(0, 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        "(() => { const rect = document.querySelector('.el-message-box').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })()"
      ),
      true,
      `${width}px确认框不能超出视口`
    );
    await click('确认删除');
    await waitClosed();
    await waitReady();
    await reload('删除验收保留项目');
    assert.equal((await readSnapshot()).projects.length, 1);
    assert.equal((await readSnapshot()).projects[0].id, kept.id);
    const last = await readData();
    await askDelete(kept.name);
    await shown('至少保留一个项目');
    assert.equal(await boxOpen(), false);
    assert.equal(await readData(), last);
    console.log(
      `PASS: ${width}px删除确认、零任务提示、删除后刷新和最后一个项目保护通过，页面与确认框无横向溢出`
    );
  }
}
