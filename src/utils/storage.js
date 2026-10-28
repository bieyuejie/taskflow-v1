export const TOKEN_KEY = 'taskflow_v1_token';
export const DATA_KEY = 'taskflow_v1_data';
export const DEMO_TOKEN = 'v1-demo-token';

export function storageGet(key) {
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch {
    return { ok: false, reason: '无法读取浏览器存储，请检查浏览器权限后重试' };
  }
}
export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch {
    return { ok: false, reason: '存储写入失败，请检查浏览器权限或剩余空间后重试' };
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
    return { ok: true };
  } catch {
    return { ok: false, reason: '无法清理登录存储，请检查浏览器权限后重试退出' };
  }
}
