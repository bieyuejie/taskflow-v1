import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { verifyProjectDeletion } from './verifyProjectDeletion.mjs';
import { verifyTaskProjectOwnership } from './verifyTaskProjectOwnership.mjs';
import { createBrowserTarget } from './browserTarget.mjs';

const browserTarget = createBrowserTarget();

// 手动运行：仅使用全新临时浏览器配置，不连接用户已有窗口或浏览器数据。
const executable =
  process.env.TASKFLOW_BROWSER_PATH ||
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
assert(executable, '找不到 Chromium 浏览器，可通过 TASKFLOW_BROWSER_PATH 指定');
const profile = mkdtempSync(path.join(tmpdir(), 'taskflow-v1-browser-'));
let browser;
let socket;
let server;
let sequence = 0;
const pending = new Map();
const exceptions = [];

async function until(action, label) {
  const deadline = Date.now() + browserTarget.waitMs;
  while (Date.now() < deadline) {
    if (await action()) return;
    await delay(100);
  }
  throw new Error(`等待超时：${label}`);
}
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
const shown = (text) =>
  until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), text);
const click = (text) =>
  evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.getClientRects().length && item.textContent.trim() === ${JSON.stringify(text)});
  if (!button) throw new Error('找不到按钮');
  button.click();
})()`);
const fill = (selector, value) =>
  evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const readData = () => evaluate("localStorage.getItem('taskflow_v1_data')");
const readSnapshot = async () => {
  const raw = await readData();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const reload = async (text) => {
  const previousOrigin = await evaluate('performance.timeOrigin');
  await send('Page.reload');
  await until(async () => {
    try {
      return await evaluate(
        `performance.timeOrigin !== ${previousOrigin} && document.readyState === 'complete'`
      );
    } catch {
      // 刷新替换执行上下文期间继续等待新文档。
      return false;
    }
  }, '刷新完成');
  await shown(text);
};
const patchWrite = (key) =>
  evaluate(`window.restoreSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (key === ${JSON.stringify(key)}) throw new DOMException('quota', 'QuotaExceededError');
    return window.restoreSet.call(this, key, value);
  };`);

try {
  if (!browserTarget.url)
    server = await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      preview: { host: '127.0.0.1', port: 4173, strictPort: false },
    });
  browser = spawn(
    executable,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' }
  );
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), '浏览器启动');
  const port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    browserTarget.onEvent(message);
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails.text);
    if (!pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  if (browserTarget.url) await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const base =
    browserTarget.url ?? `http://127.0.0.1:${server.httpServer.address().port}/taskflow-v1/`;
  await send('Page.navigate', { url: base });
  await shown('演示环境');
  await until(async () => (await readSnapshot())?.tasks.length === 3, '首启持久化');

  const broken = '{{ browser broken json';
  await evaluate(`localStorage.setItem('taskflow_v1_data', ${JSON.stringify(broken)})`);
  await reload('本地数据无法解析');
  assert.equal(await readData(), broken);
  await click('重置本地数据');
  await shown('确认重置本地数据');
  await click('取消');
  assert.equal(await readData(), broken);
  await until(
    () =>
      evaluate(
        "[...document.querySelectorAll('.el-message-box')].every(box => !box.getClientRects().length)"
      ),
    '取消确认关闭'
  );
  await click('重置本地数据');
  await shown('确认重置本地数据');
  await click('确认重置');
  await until(async () => (await readSnapshot())?.tasks.length === 3, '确认后重置');
  await until(() => evaluate("!document.querySelector('.storage-notice')"), '恢复提示消失');
  console.log('PASS: 浏览器损坏原值保留、取消不写入、确认重置恢复');

  await fill('input[placeholder="请输入账号"]', 'browser-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('新增任务');
  assert.equal(await evaluate('location.hash'), '#/task-list');
  await click('新增任务');
  await until(() => evaluate("!!document.querySelector('.el-dialog input')"), '新增弹窗');
  await fill('.el-dialog input', '浏览器持久化');
  await click('确定');
  await until(
    async () => JSON.parse(await readData()).tasks.some((task) => task.title === '浏览器持久化'),
    '新增保存'
  );
  await reload('浏览器持久化');
  assert.equal(JSON.parse(await readData()).tasks.length, 4);
  await evaluate(
    "[...document.querySelectorAll('.el-table__row')].find(row => row.innerText.includes('浏览器持久化')).querySelector('button').click()"
  );
  await until(() => evaluate("!!document.querySelector('.el-dialog input')"), '编辑弹窗');
  await fill('.el-dialog input', '失败后重试');
  const before = await readData();
  await patchWrite('taskflow_v1_data');
  await click('确定');
  await shown('存储写入失败');
  assert.equal(await readData(), before);
  assert.equal(await evaluate("!!document.querySelector('.el-dialog input')"), true);
  await evaluate('Storage.prototype.setItem = window.restoreSet');
  await click('确定');
  await until(
    async () => JSON.parse(await readData()).tasks.some((task) => task.title === '失败后重试'),
    '重试保存'
  );
  assert.equal(JSON.parse(await readData()).tasks.length, 4);
  console.log('PASS: 浏览器V1登录、实际刷新保留、写失败弹窗保留与重试不重复');

  await click('退出登录');
  await shown('演示环境');
  await patchWrite('taskflow_v1_token');
  await fill('input[placeholder="请输入账号"]', 'browser-audit');
  await fill('input[placeholder="请输入密码"]', 'demo');
  await click('登录');
  await shown('存储写入失败');
  assert.equal(await evaluate('location.hash'), '#/login');
  assert.equal(await evaluate("localStorage.getItem('taskflow_v1_token')"), null);
  assert.equal(JSON.parse(await readData()).tasks.length, 4);
  await evaluate('Storage.prototype.setItem = window.restoreSet');
  await click('登录');
  await shown('失败后重试');
  console.log('PASS: 浏览器Token保存失败不跳转、不提示假成功，退出保留业务数据');

  const original = await readData();
  const injection = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.restoreGet = Storage.prototype.getItem; Storage.prototype.getItem = function(key) { if(key === 'taskflow_v1_data') throw new Error('read denied'); return window.restoreGet.call(this, key); };`,
  });
  await reload('无法读取浏览器存储');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
  assert.equal(
    await evaluate("window.restoreGet.call(localStorage, 'taskflow_v1_data')"),
    original
  );
  assert.equal(await evaluate("!!document.querySelector('.task-list-page')"), false);
  for (const width of [375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      `${width}px恢复提示不能撑破页面`
    );
  }
  await evaluate('Storage.prototype.getItem = window.restoreGet');
  await click('重试读取');
  await shown('失败后重试');
  assert.equal(await readData(), original);
  console.log('PASS: 浏览器读取异常保留原数据、暂停业务、重试恢复及375/768px提示无横向溢出');
  await verifyProjectDeletion({
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
  });
  await verifyTaskProjectOwnership({
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
  });
  assert.deepEqual(exceptions, [], '浏览器不应有未捕获的运行异常');
  browserTarget.assertHealthy();
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    console.log(
      '浏览器失败时页面：',
      await evaluate('document.body.innerText').catch(() => '无法读取')
    );
  }
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await Promise.race([send('Browser.close').catch(() => {}), delay(1000)]);
    socket.close();
  }
  if (browser && browser.exitCode === null) {
    await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), delay(2000)]);
    if (browser.exitCode === null) browser.kill();
  }
  if (server) {
    server.httpServer.closeAllConnections();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
  const absoluteProfile = path.resolve(profile);
  const allowedPrefix = path.join(path.resolve(tmpdir()), 'taskflow-v1-browser-');
  assert(absoluteProfile.startsWith(allowedPrefix), '只清理本次临时浏览器配置');
  rmSync(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
