import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDate =
  process.env.TASKFLOW_BROWSER_ARTIFACT_DATE ??
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
assert(/^\d{4}-\d{2}-\d{2}$/.test(artifactDate), '截图日期须为YYYY-MM-DD');
const env = {
  ...process.env,
  TASKFLOW_BROWSER_TARGET: 'https://bieyuejie.github.io/taskflow-v1/',
  TASKFLOW_BROWSER_ARTIFACT_STAGE: 'stage6',
  TASKFLOW_BROWSER_ARTIFACT_DATE: artifactDate,
};

for (const script of [
  'verifyBrowser.mjs',
  'verifyStage3Browser.mjs',
  'verifyStage4Browser.mjs',
  'verifyLazyRoutesBrowser.mjs',
]) {
  console.log(`RUN: 线上验收 ${script}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`], {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode));
  });
  assert.equal(code, 0, `线上验收入口失败：${script}`);
}
console.log('PASS: 独立 GitHub Pages 完整线上浏览器验收通过');
