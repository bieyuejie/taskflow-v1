import { writeFileSync } from 'node:fs';
import { verifyStage4Browser } from './stage4BrowserCases.mjs';
import { verifyKanbanProjectsBrowser } from './kanbanProjectBrowserCase.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { createBrowserTarget } from './browserTarget.mjs';

// 手动运行：仅使用全新临时浏览器配置，不连接用户已有窗口或浏览器数据。
const browserTarget = createBrowserTarget();
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
let interceptedDrag = null;
const artifactStage = process.env.TASKFLOW_BROWSER_ARTIFACT_STAGE ?? 'stage4';
const artifactDate = process.env.TASKFLOW_BROWSER_ARTIFACT_DATE ?? '2026-11-03';
assert(/^stage[1-6]$/.test(artifactStage), '截图阶段须为stage1～stage6');
assert(/^\d{4}-\d{2}-\d{2}$/.test(artifactDate), '截图日期须为YYYY-MM-DD');

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
    if (message.method === 'Input.dragIntercepted') interceptedDrag = message.params.data;
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

  const context = {
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
    exceptions,
    interceptDrag: async () => {
      interceptedDrag = null;
      await send('Input.setInterceptDrags', { enabled: true });
    },
    dragData: () => interceptedDrag,
    capture: async (name) => {
      assert.equal(path.basename(name), name, '截图名称不能包含目录');
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      mkdirSync(new URL(`../docs/${artifactStage}/`, import.meta.url), { recursive: true });
      writeFileSync(
        new URL(
          `../docs/${artifactStage}/` + name.replace(/\d{4}-\d{2}-\d{2}/g, artifactDate),
          import.meta.url
        ),
        Buffer.from(result.data, 'base64')
      );
    },
  };
  await verifyKanbanProjectsBrowser(context);
  await verifyStage4Browser(context);
  assert.deepEqual(exceptions, [], '第四阶段联动与异常浏览器验收无未捕获异常');
  browserTarget.assertHealthy();
  console.log('PASS: 第四阶段联动与异常浏览器场景全部通过');
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
