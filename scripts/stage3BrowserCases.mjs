import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifySubtaskCompletionBrowser({
  fill,
  click,
  shown,
  readSnapshot,
  readData,
  patchWrite,
  send,
  evaluate,
  until,
  reload,
  exceptions,
}) {
  await fill('input[placeholder="请输入账号"]', 'subtask-completion-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  const initial = await readSnapshot();
  const parent = initial.tasks.find((task) => task.parentId === null && task.status === 'todo');
  const rootCount = initial.tasks.filter((task) => task.parentId === null).length;
  const childTitle = '勾选浏览器验证';
  const dialogVisible = () =>
    evaluate("[...document.querySelectorAll('.el-dialog')].some(d => d.getClientRects().length)");
  const ready = () =>
    until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b => b.getClientRects().length) && !document.querySelector('.el-dialog input').disabled"
        ),
      '操作结束'
    );
  const openChildren = async () => {
    await evaluate(
      "(() => { const row = [...document.querySelectorAll('.el-table__row')].find(row => row.innerText.includes(" +
        JSON.stringify(parent.title) +
        ")); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '子任务').click(); })()"
    );
    await shown('添加子任务');
    await ready();
  };
  const closeChildren = async () => {
    await evaluate(
      "[...document.querySelectorAll('.el-dialog__headerbtn')].find(b => b.getClientRects().length).click()"
    );
    await until(async () => !(await dialogVisible()), '弹窗关闭');
  };
  const installDelay = () =>
    evaluate(
      "window.auditStore = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task'); window.originalToggle = window.auditStore.setSubtaskCompleted.bind(window.auditStore); window.toggleCalls = 0; window.auditStore.setSubtaskCompleted = (...args) => { window.toggleCalls++; return new Promise((resolve, reject) => { window.releaseToggle = () => { window.releaseToggle = null; return window.originalToggle(...args).then(resolve, reject); }; }); };"
    );
  const clickCheckbox = () =>
    evaluate("document.querySelector('.el-dialog input[type=checkbox]').click()");
  const checked = () =>
    evaluate("document.querySelector('.el-dialog input[type=checkbox]').checked");
  const beginToggle = async () => {
    const count = await evaluate('window.toggleCalls');
    await clickCheckbox();
    await until(() => evaluate("typeof window.releaseToggle === 'function'"), '勾选提交挂起');
    assert.equal(
      await evaluate("document.querySelector('.el-dialog input[type=checkbox]').disabled"),
      true
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b => b.getClientRects().length)"
      ),
      false
    );
    await clickCheckbox();
    assert.equal(await evaluate('window.toggleCalls'), count + 1, '连续勾选只提交一次');
  };
  await openChildren();
  await fill('.el-dialog input', childTitle);
  await click('添加子任务');
  await shown(childTitle);
  await ready();
  const child = (await readSnapshot()).tasks.find((task) => task.title === childTitle);
  assert(child);
  await closeChildren();
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    await installDelay();
    await openChildren();
    assert.equal(await checked(), false);
    const parentBefore = (await readSnapshot()).tasks.find((task) => task.id === parent.id).status;
    await beginToggle();
    await evaluate('window.releaseToggle()');
    await ready();
    assert.equal(await checked(), true);
    await shown('已完成 1 / 1 个子任务');
    let snapshot = await readSnapshot();
    assert.equal(snapshot.tasks.find((task) => task.id === child.id).status, 'done');
    assert.equal(
      snapshot.tasks.find((task) => task.id === parent.id).status,
      parentBefore,
      '子任务全完成不自动完成父任务'
    );
    assert.equal(snapshot.tasks.filter((task) => task.parentId === null).length, rootCount);
    await closeChildren();
    await evaluate(
      'window.auditStore.editTask(' + JSON.stringify(parent.id) + ", {status:'done'})"
    );
    await openChildren();
    if (width === 1280) {
      const before = await readData();
      await patchWrite('taskflow_v1_data');
      await beginToggle();
      await evaluate('window.releaseToggle()');
      await shown('存储写入失败');
      await ready();
      assert.equal(await readData(), before);
      assert.equal(await checked(), true, '写失败后复选框恢复已完成');
      await shown('已完成 1 / 1 个子任务');
      await evaluate('Storage.prototype.setItem = window.restoreSet');
      console.log('PASS: 实际复选框取消勾选写失败后恢复，父子原值和进度保留，操作锁与关闭入口恢复');
    }
    await beginToggle();
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await delay(100);
    assert.equal(await dialogVisible(), true);
    await evaluate('window.releaseToggle()');
    await ready();
    assert.equal(await checked(), false);
    await shown('已完成 0 / 1 个子任务');
    snapshot = await readSnapshot();
    assert.equal(snapshot.tasks.find((task) => task.id === parent.id).status, 'doing');
    const changedChild = snapshot.tasks.find((task) => task.id === child.id);
    assert.equal(changedChild.status, 'todo');
    assert.equal(changedChild.createTime, child.createTime);
    assert.equal(changedChild.parentId, parent.id);
    assert.equal(changedChild.projectId, parent.projectId);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog')].filter(d=>d.getClientRects().length).every(d=>d.getBoundingClientRect().left>=0 && d.getBoundingClientRect().right<=innerWidth)"
      ),
      true
    );
    await closeChildren();
    await reload(parent.title);
    await openChildren();
    assert.equal(await checked(), false);
    await shown('已完成 0 / 1 个子任务');
    await closeChildren();
    console.log(
      'PASS: ' +
        width +
        'px勾选、取消、父任务done→doing、进度、刷新保留、防重复和弹窗保护、无横向溢出'
    );
  }
  assert.deepEqual(exceptions, [], '无未捕获浏览器异常');
}

export async function verifySubtaskEditsBrowser({
  fill,
  click,
  shown,
  readSnapshot,
  readData,
  patchWrite,
  send,
  evaluate,
  until,
  reload,
  exceptions,
}) {
  await fill('input[placeholder="请输入账号"]', 'subtask-edit-save-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  const initial = await readSnapshot();
  const parent = initial.tasks.find((task) => task.parentId === null && task.status === 'todo');
  const dialogVisible = () =>
    evaluate("[...document.querySelectorAll('.el-dialog')].some(d=>d.getClientRects().length)");
  const ready = () =>
    until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b=>b.getClientRects().length) && !document.querySelector('.el-dialog form input').disabled"
        ),
      '操作结束'
    );
  const openChildren = async () => {
    await evaluate(
      "(()=>{const row=[...document.querySelectorAll('.el-table__row')].find(row=>row.innerText.includes(" +
        JSON.stringify(parent.title) +
        "));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='子任务').click();})()"
    );
    await shown('添加子任务');
    await ready();
  };
  const closeChildren = async () => {
    await evaluate(
      "[...document.querySelectorAll('.el-dialog__headerbtn')].find(b=>b.getClientRects().length).click()"
    );
    await until(async () => !(await dialogVisible()), '弹窗关闭');
  };
  const editChild = (name) =>
    evaluate(
      "(()=>{const row=[...document.querySelectorAll('.el-dialog .el-table__row')].find(row=>row.innerText.includes(" +
        JSON.stringify(name) +
        "));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='编辑').click();})()"
    );
  const editInput = '.el-dialog form:nth-of-type(2) input';
  const editDesc = '.el-dialog form:nth-of-type(2) textarea';
  await openChildren();
  await fill('.el-dialog form input', '保存前子任务');
  await click('添加子任务');
  await shown('保存前子任务');
  await ready();
  const original = await readSnapshot();
  const child = original.tasks.find((task) => task.title === '保存前子任务');
  const unrelated = original.tasks.filter((task) => task.id !== child.id);
  const originalFields = { ...child };
  delete originalFields.title;
  delete originalFields.desc;
  await closeChildren();
  const installDelay = () =>
    evaluate(
      "window.auditStore=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task');window.auditEditOriginal=window.auditStore.editSubtask.bind(window.auditStore);window.editCalls=0;window.auditStore.editSubtask=(...args)=>{window.editCalls++;return new Promise((resolve,reject)=>{window.releaseEdit=()=>{window.releaseEdit=null;return window.auditEditOriginal(...args).then(resolve,reject);};});};window.editWrites=0;window.auditEditSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=window.auditEditSet.call(this,key,value);if(key==='taskflow_v1_data')window.editWrites++;return result;};"
    );
  const beginSave = async () => {
    const calls = await evaluate('window.editCalls');
    await click('保存修改');
    await until(() => evaluate("typeof window.releaseEdit==='function'"), '保存请求挂起');
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').disabled'),
      true
    );
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editDesc) + ').disabled'),
      true
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog button')].find(b=>b.textContent.trim()==='取消编辑').disabled"
      ),
      true
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b=>b.getClientRects().length)"
      ),
      false
    );
    await evaluate(
      "document.querySelector('.el-dialog form:nth-of-type(2)').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))"
    );
    assert.equal(await evaluate('window.editCalls'), calls + 1, '连续提交只保存一次');
  };
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    await installDelay();
    await openChildren();
    const before = await readSnapshot();
    const beforeChild = before.tasks.find((task) => task.id === child.id);
    const beforeRaw = await readData();
    await editChild(beforeChild.title);
    await shown('保存修改');
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').value'),
      beforeChild.title
    );
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editDesc) + ').value'),
      beforeChild.desc
    );
    if (width === 1280) {
      await fill(editInput, '   ');
      await click('保存修改');
      await shown('子任务标题请输入 1～100 个字符');
      assert.equal(await evaluate('window.editCalls'), 0, '空白标题不发保存请求');
      assert.equal(await readData(), beforeRaw);
    }
    const newTitle = '修改后的子任务-' + width;
    const draftTitle = '  ' + newTitle + '  ';
    const newDesc = '编辑描述-' + width + '\n第二行内容';
    await fill(editInput, draftTitle);
    await fill(editDesc, newDesc);
    assert.equal(await readData(), beforeRaw, '输入草稿不写入');
    if (width === 1280) {
      await patchWrite('taskflow_v1_data');
      await beginSave();
      await evaluate('window.releaseEdit()');
      await shown('存储写入失败');
      await ready();
      assert.equal(await readData(), beforeRaw);
      assert.equal(
        await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').value'),
        draftTitle
      );
      assert.equal(
        await evaluate('document.querySelector(' + JSON.stringify(editDesc) + ').value'),
        newDesc
      );
      assert.equal(await evaluate('window.editWrites'), 0);
      assert.equal(await evaluate("document.body.innerText.includes('子任务编辑成功')"), false);
      await evaluate('Storage.prototype.setItem=window.restoreSet');
      console.log(
        'PASS: 空白标题拒绝，写失败保留标题和描述草稿/原快照，不假报成功，恢复取消与关闭入口'
      );
    }
    await beginSave();
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await delay(100);
    assert.equal(await dialogVisible(), true);
    await evaluate('window.releaseEdit()');
    await ready();
    await shown('子任务编辑成功');
    await shown(newTitle);
    assert.equal(
      await evaluate("!!document.querySelector('.el-dialog form:nth-of-type(2)')"),
      false
    );
    assert.equal(await evaluate('window.editWrites'), 1, '成功和失败后重试仅一次有效写入');
    const snapshot = await readSnapshot();
    const result = snapshot.tasks.find((task) => task.id === child.id);
    assert.equal(result.title, newTitle);
    assert.equal(result.desc, newDesc);
    const fields = { ...result };
    delete fields.title;
    delete fields.desc;
    assert.deepEqual(fields, originalFields);
    assert.deepEqual(
      snapshot.tasks.filter((task) => task.id !== child.id),
      unrelated
    );
    assert.equal(snapshot.tasks.filter((task) => task.parentId === parent.id).length, 1);
    await shown('已完成 0 / 1 个子任务');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog')].filter(d=>d.getClientRects().length).every(d=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth)"
      ),
      true
    );
    await closeChildren();
    await reload(parent.title);
    await openChildren();
    await editChild(newTitle);
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').value'),
      newTitle
    );
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editDesc) + ').value'),
      newDesc
    );
    await click('取消编辑');
    await closeChildren();
    console.log(
      'PASS: ' +
        width +
        'px保存与刷新保留、标题trim、其他字段及任务不变、防重复、弹窗保护及无横向溢出'
    );
  }
  assert.deepEqual(exceptions, [], '无未捕获浏览器异常');
}

export async function verifySubtaskDeletionBrowser({
  fill,
  click,
  shown,
  readSnapshot,
  readData,
  patchWrite,
  send,
  evaluate,
  until,
  reload,
  exceptions,
}) {
  await fill('input[placeholder="请输入账号"]', 'subtask-delete-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  const initial = await readSnapshot();
  const parent = initial.tasks.find((task) => task.parentId === null && task.status === 'todo');
  const rootCount = initial.tasks.filter((task) => task.parentId === null).length;
  const dialogVisible = () =>
    evaluate("[...document.querySelectorAll('.el-dialog')].some(d=>d.getClientRects().length)");
  const ready = () =>
    until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b=>b.getClientRects().length) && !document.querySelector('.el-dialog form input').disabled"
        ),
      '子任务操作结束'
    );
  const openChildren = async () => {
    await evaluate(
      "(()=>{const row=[...document.querySelectorAll('.el-table__row')].find(row=>row.innerText.includes(" +
        JSON.stringify(parent.title) +
        "));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='子任务').click();})()"
    );
    await shown('添加子任务');
    await ready();
  };
  const closeChildren = async () => {
    await evaluate(
      "[...document.querySelectorAll('.el-dialog__headerbtn')].find(b=>b.getClientRects().length).click()"
    );
    await until(async () => !(await dialogVisible()), '关闭子任务弹窗');
  };
  const rowButton = (name, label) =>
    evaluate(
      "(()=>{const row=[...document.querySelectorAll('.el-dialog .el-table__row')].find(row=>row.innerText.includes(" +
        JSON.stringify(name) +
        "));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()===" +
        JSON.stringify(label) +
        ').click();})()'
    );
  const messageButton = (label) =>
    evaluate(
      "[...document.querySelectorAll('.el-message-box__btns button')].find(b=>b.getClientRects().length && b.textContent.trim()===" +
        JSON.stringify(label) +
        ').click()'
    );
  const noConfirm = () =>
    until(
      () =>
        evaluate(
          "[...document.querySelectorAll('.el-message-box')].every(b=>!b.getClientRects().length)"
        ),
      '确认框关闭'
    );
  const confirmVisible = () =>
    evaluate(
      "[...document.querySelectorAll('.el-message-box')].filter(b=>b.getClientRects().length).length"
    );
  const addChild = async (title) => {
    await fill('.el-dialog form input', title);
    await click('添加子任务');
    await shown(title);
    await ready();
  };
  const editInput = '.el-dialog form:nth-of-type(2) input';
  const editDesc = '.el-dialog form:nth-of-type(2) textarea';
  await openChildren();
  await addChild('保留的已完成子任务');
  await evaluate("document.querySelector('.el-dialog input[type=checkbox]').click()");
  await ready();
  await shown('已完成 1 / 1 个子任务');
  const keeper = (await readSnapshot()).tasks.find((task) => task.title === '保留的已完成子任务');
  assert.equal(keeper.status, 'done');
  await closeChildren();
  const installDelay = () =>
    evaluate(
      "window.auditStore=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task');window.originalRemove=window.auditStore.removeSubtask.bind(window.auditStore);window.removeCalls=0;window.auditStore.removeSubtask=(...args)=>{window.removeCalls++;return new Promise((resolve,reject)=>{window.releaseRemove=()=>{window.releaseRemove=null;return window.originalRemove(...args).then(resolve,reject);};});};window.deleteWrites=0;window.auditDeleteSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=window.auditDeleteSet.call(this,key,value);if(key==='taskflow_v1_data')window.deleteWrites++;return result;};"
    );
  const beginConfirm = async (title) => {
    await rowButton(title, '删除');
    await shown('确定删除子任务“' + title + '”吗？');
    assert.equal(await confirmVisible(), 1);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog .el-table button')].every(b=>b.disabled)"
      ),
      true
    );
  };
  const confirmHeld = async (title) => {
    const calls = await evaluate('window.removeCalls');
    await beginConfirm(title);
    await messageButton('删除');
    await noConfirm();
    await until(() => evaluate("typeof window.releaseRemove==='function'"), '删除请求挂起');
    assert.equal(await evaluate('window.removeCalls'), calls + 1);
    await rowButton(title, '删除');
    assert.equal(await evaluate('window.removeCalls'), calls + 1, '重复删除被拦截');
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog__headerbtn')].some(b=>b.getClientRects().length)"
      ),
      false
    );
  };
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    await openChildren();
    const title = '待删除子任务-' + width;
    await addChild(title);
    const baseline = await readSnapshot();
    const target = baseline.tasks.find((task) => task.title === title);
    const beforeRaw = await readData();
    await installDelay();
    assert.equal(
      await evaluate("document.querySelectorAll('.el-dialog button button').length"),
      0,
      '编辑/删除按钮不能嵌套'
    );
    await beginConfirm(title);
    assert.equal(
      await evaluate("!!document.querySelector('.el-dialog form:nth-of-type(2)')"),
      false,
      '删除不打开编辑表单'
    );
    await rowButton(title, '删除');
    assert.equal(await confirmVisible(), 1);
    await messageButton('取消');
    await noConfirm();
    await ready();
    assert.equal(await readData(), beforeRaw);
    assert.equal(await evaluate('window.deleteWrites'), 0);
    assert.equal(await evaluate('window.removeCalls'), 0, '取消不调用删除API');
    await rowButton(title, '编辑');
    await fill(editInput, '保留待删除编辑草稿-' + width);
    await fill(editDesc, '取消或失败后保留的描述');
    await beginConfirm(title);
    await messageButton('取消');
    await noConfirm();
    await ready();
    assert.equal(
      await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').value'),
      '保留待删除编辑草稿-' + width
    );
    assert.equal(await readData(), beforeRaw);
    if (width === 1280) {
      await patchWrite('taskflow_v1_data');
      await confirmHeld(title);
      await evaluate('window.releaseRemove()');
      await shown('存储写入失败');
      await ready();
      assert.equal(await readData(), beforeRaw);
      assert.equal(await evaluate('window.deleteWrites'), 0);
      assert.equal(
        await evaluate('document.querySelector(' + JSON.stringify(editInput) + ').value'),
        '保留待删除编辑草稿-' + width
      );
      assert.equal(
        await evaluate('document.querySelector(' + JSON.stringify(editDesc) + ').value'),
        '取消或失败后保留的描述'
      );
      assert.equal(await evaluate("document.body.innerText.includes('子任务删除成功')"), false);
      await evaluate('Storage.prototype.setItem=window.restoreSet');
      console.log('PASS: 删除写失败保留原数据和编辑草稿、不假报成功，恢复操作与关闭入口，允许重试');
    }
    await confirmHeld(title);
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 2,
      y: 2,
      button: 'left',
      clickCount: 1,
    });
    await delay(100);
    assert.equal(await dialogVisible(), true);
    await evaluate('window.releaseRemove()');
    await ready();
    await shown('子任务删除成功');
    assert.equal(await evaluate('window.deleteWrites'), 1, '仅一次有效删除写入');
    const after = await readSnapshot();
    assert.equal(
      after.tasks.some((task) => task.id === target.id),
      false
    );
    assert.deepEqual(
      after.tasks,
      baseline.tasks.filter((task) => task.id !== target.id),
      '仅删除目标，父任务、兄弟及其他任务不变'
    );
    assert.equal(after.tasks.filter((task) => task.parentId === null).length, rootCount);
    assert.equal(
      await evaluate("!!document.querySelector('.el-dialog form:nth-of-type(2)')"),
      false,
      '删除成功清理对应编辑草稿'
    );
    await shown('已完成 1 / 1 个子任务');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-dialog')].filter(d=>d.getClientRects().length).every(d=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth)"
      ),
      true
    );
    await closeChildren();
    await reload(parent.title);
    await openChildren();
    assert.equal(
      await evaluate(
        "document.querySelector('.el-dialog').innerText.includes(" + JSON.stringify(title) + ')'
      ),
      false
    );
    await shown('已完成 1 / 1 个子任务');
    await closeChildren();
    console.log(
      'PASS: ' +
        width +
        'px按钮并列、确认名称、取消零写入、防重复、仅删目标、草稿清理、进度/刷新保持及无横向溢出'
    );
  }
  await openChildren();
  await beginConfirm(keeper.title);
  await messageButton('删除');
  await noConfirm();
  await ready();
  await shown('暂无子任务');
  await shown('已完成 0 / 0 个子任务');
  const empty = await readSnapshot();
  assert.equal(
    empty.tasks.some((task) => task.parentId === parent.id),
    false
  );
  assert.deepEqual(
    empty.tasks.find((task) => task.id === parent.id),
    parent
  );
  await closeChildren();
  await reload(parent.title);
  await openChildren();
  await shown('暂无子任务');
  await shown('已完成 0 / 0 个子任务');
  await closeChildren();
  assert.deepEqual(exceptions, [], '无未捕获浏览器异常');
  console.log('PASS: 删除最后一个子任务后空列表和零进度，刷新不填充，父任务保留');
}

export async function verifyCascadeBrowser({
  fill,
  click,
  shown,
  readSnapshot,
  readData,
  patchWrite,
  send,
  evaluate,
  until,
  reload,
  exceptions,
}) {
  await fill('input[placeholder="请输入账号"]', 'cascade-ui-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  const original = await readSnapshot();
  const parent = original.tasks.find((t) => t.parentId === null && t.status === 'todo');
  const prepare = async (count, pagination = false) => {
    const seed = structuredClone(original);
    let id = Date.now() + 10000;
    const other = seed.tasks.find((t) => t.status === 'doing');
    const project = {
      id: String(id++),
      name: '级联验收独立项目',
      desc: '',
      createTime: Date.now(),
    };
    seed.projects.push(project);
    const extra = { ...other, id: String(id++), projectId: project.id, title: '其他项目保留任务' };
    seed.tasks.push(extra);
    for (const [root, total] of [
      [parent, count],
      [other, 2],
      [extra, 2],
    ])
      for (let n = 0; n < total; n++)
        seed.tasks.push({
          ...root,
          id: String(id++),
          title: '级联子任务' + n,
          parentId: root.id,
          status: n % 2 ? 'done' : 'todo',
          dueDate: null,
        });
    let target = parent;
    if (pagination) {
      for (let n = 0; n < 7; n++) {
        const root = { ...parent, id: String(id++), title: '分页任务' + n };
        seed.tasks.push(root);
        if (n === 6) target = root;
      }
      seed.tasks.push({
        ...target,
        id: String(id++),
        title: '分页目标子任务',
        parentId: target.id,
        status: 'todo',
        dueDate: null,
      });
    }
    await evaluate(
      "localStorage.setItem('taskflow_v1_data'," + JSON.stringify(JSON.stringify(seed)) + ')'
    );
    await reload('新增任务');
    return { seed, target };
  };
  const ready = () =>
    until(
      () =>
        evaluate(
          "!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task').loading && [...document.querySelectorAll('.task-list-page .el-table__row button')].some(b=>!b.disabled)"
        ),
      '删除锁释放'
    );
  const rowDelete = (title) =>
    evaluate(
      "(()=>{const row=[...document.querySelectorAll('.task-list-page .el-table__row')].find(r=>r.innerText.includes(" +
        JSON.stringify(title) +
        "));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='删除').click();})()"
    );
  const confirmCount = () =>
    evaluate(
      "[...document.querySelectorAll('.el-message-box')].filter(b=>b.getClientRects().length).length"
    );
  const messageButton = (text) =>
    evaluate(
      "[...document.querySelectorAll('.el-message-box__btns button')].find(b=>b.getClientRects().length && b.textContent.trim()===" +
        JSON.stringify(text) +
        ').click()'
    );
  const noConfirm = () => until(async () => (await confirmCount()) === 0, '确认框关闭');
  const install = () =>
    evaluate(
      "window.auditStore=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('task');window.origCount=window.auditStore.fetchSubtaskCount.bind(window.auditStore);window.origDelete=window.auditStore.removeTask.bind(window.auditStore);window.countCalls=0;window.deleteCalls=0;window.auditStore.fetchSubtaskCount=(...args)=>{window.countCalls++;return new Promise((resolve,reject)=>{window.releaseCount=()=>{window.releaseCount=null;return window.origCount(...args).then(resolve,reject);};});};window.auditStore.removeTask=(...args)=>{window.deleteCalls++;return new Promise((resolve,reject)=>{window.releaseDelete=()=>{window.releaseDelete=null;return window.origDelete(...args).then(resolve,reject);};});};window.cascadeWrites=0;window.origCascadeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=window.origCascadeSet.call(this,key,value);if(key==='taskflow_v1_data')window.cascadeWrites++;return result;};"
    );
  const beginCount = async (title) => {
    const count = await evaluate('window.countCalls');
    await rowDelete(title);
    await until(() => evaluate("typeof window.releaseCount==='function'"), '数量查询挂起');
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.task-list-page .el-table__row button')].every(b=>b.disabled)"
      ),
      true
    );
    await rowDelete(title);
    assert.equal(await evaluate('window.countCalls'), count + 1);
  };
  const beginConfirm = async (title, total) => {
    await beginCount(title);
    await evaluate('window.releaseCount()');
    await shown('将删除 1 个顶层任务及 ' + total + ' 个子任务。');
    assert.equal(await confirmCount(), 1);
  };
  const confirmDelete = async () => {
    const count = await evaluate('window.deleteCalls');
    await messageButton('确认删除');
    await noConfirm();
    await until(() => evaluate("typeof window.releaseDelete==='function'"), '删除提交挂起');
    assert.equal(await evaluate('window.deleteCalls'), count + 1);
  };
  for (const width of [1280, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width !== 1280,
    });
    const total = width === 1280 ? 1005 : 2;
    const { seed } = await prepare(total);
    await install();
    const raw = await readData();
    if (width === 1280) {
      await beginCount(parent.title);
      await evaluate(
        "window.origCountGet=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='taskflow_v1_token')throw new Error('数量查询读取失败');return window.origCountGet.call(this,key);};"
      );
      await evaluate('window.releaseCount()');
      await shown('无法读取浏览器存储');
      await ready();
      assert.equal(await confirmCount(), 0);
      assert.equal(await evaluate('window.deleteCalls'), 0);
      assert.equal(await readData(), raw);
      await evaluate('Storage.prototype.getItem=window.origCountGet');
      console.log('PASS: 数量查询失败不弹确认、不删除、不写入，操作恢复');
    }
    await beginConfirm(parent.title, total);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.el-message-box')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().left>=0&&b.getBoundingClientRect().right<=innerWidth)"
      ),
      true
    );
    await messageButton('取消');
    await noConfirm();
    await ready();
    assert.equal(await readData(), raw);
    assert.equal(await evaluate('window.deleteCalls'), 0);
    assert.equal(await evaluate('window.cascadeWrites'), 0);
    if (width === 1280) {
      await patchWrite('taskflow_v1_data');
      await beginConfirm(parent.title, total);
      await confirmDelete();
      await evaluate('window.releaseDelete()');
      await shown('存储写入失败');
      await ready();
      assert.equal(await readData(), raw);
      assert.equal(await evaluate('window.cascadeWrites'), 0);
      assert.equal(
        await evaluate("document.body.innerText.includes('任务及其子任务删除成功')"),
        false
      );
      await evaluate('Storage.prototype.setItem=window.restoreSet');
      console.log('PASS: 父子级联写失败保留完整快照、不假报成功，允许恢复后重试');
    }
    await beginConfirm(parent.title, total);
    await confirmDelete();
    await evaluate('window.releaseDelete()');
    await shown('任务及其子任务删除成功');
    await ready();
    const snapshot = await readSnapshot();
    assert.deepEqual(snapshot, {
      ...seed,
      tasks: seed.tasks.filter((t) => t.id !== parent.id && t.parentId !== parent.id),
    });
    assert.equal(await evaluate('window.cascadeWrites'), 1);
    assert.equal(await evaluate('window.auditStore.total'), 3);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await reload('新增任务');
    assert.equal(
      (await readSnapshot()).tasks.some((t) => t.id === parent.id || t.parentId === parent.id),
      false
    );
    console.log(
      'PASS: ' +
        width +
        'px实际数量确认、取消零写入、防重复、一次级联、其他项目保留及刷新保持，无横向溢出'
    );
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const { seed, target } = await prepare(0, true);
  await install();
  await evaluate("document.querySelector('.el-pagination .btn-next').click()");
  await shown(target.title);
  await ready();
  assert.equal(await evaluate('window.auditStore.query.page'), 2);
  await beginConfirm(target.title, 1);
  await confirmDelete();
  await evaluate('window.releaseDelete()');
  await shown('任务及其子任务删除成功');
  await ready();
  await until(() => evaluate('window.auditStore.query.page===1'), '删除末页后回上一页');
  assert.equal(await evaluate('window.auditStore.total'), 10);
  assert.equal(await evaluate('window.cascadeWrites'), 1);
  assert.deepEqual(await readSnapshot(), {
    ...seed,
    tasks: seed.tasks.filter((t) => t.id !== target.id && t.parentId !== target.id),
  });
  assert.deepEqual(exceptions, [], '无未捕获浏览器异常');
  console.log('PASS: 删除第2页唯一父任务及其子任务后，回到第1页且总数10，单次写入');
}
