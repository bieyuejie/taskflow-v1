import assert from 'node:assert/strict';

export function createBrowserTarget() {
  const url = process.env.TASKFLOW_BROWSER_TARGET;
  assert(
    url === undefined || url === 'https://bieyuejie.github.io/taskflow-v1/',
    '线上浏览器验收只允许独立 V1 的精确地址'
  );
  const requests = new Map();
  const failures = [];
  let responseCount = 0;
  if (url) console.log(`RUN: 线上真实目标 ${url}（独立临时浏览器配置）`);
  return {
    url,
    waitMs: url ? 30000 : 10000,
    onEvent(message) {
      if (!url) return;
      const { method, params } = message;
      if (method === 'Network.requestWillBeSent' && params.request.url.startsWith(url)) {
        requests.set(params.requestId, params.request.url);
      }
      if (method === 'Network.responseReceived' && params.response.url.startsWith(url)) {
        const response = params.response;
        responseCount++;
        const pathname = new URL(response.url).pathname;
        if (
          response.status >= 400 ||
          (pathname.endsWith('.js') && !/(?:java|ecma)script/i.test(response.mimeType)) ||
          (pathname.endsWith('.css') && !/text\/css/i.test(response.mimeType))
        ) {
          failures.push({
            url: response.url,
            status: response.status,
            mimeType: response.mimeType,
          });
        }
      }
      if (method === 'Network.loadingFailed') {
        if (requests.has(params.requestId) && !params.canceled) {
          failures.push({ url: requests.get(params.requestId), error: params.errorText });
        }
        requests.delete(params.requestId);
      }
      if (method === 'Network.loadingFinished') requests.delete(params.requestId);
    },
    assertHealthy() {
      if (!url) return;
      assert(responseCount > 0, '线上验收必须实际读取目标站点资源');
      assert.deepEqual(failures, [], '线上资源不能存在 HTTP、类型或非取消的加载错误');
      console.log(`PASS: 线上实际资源响应${responseCount}次，无HTTP、类型或加载错误`);
    },
  };
}
