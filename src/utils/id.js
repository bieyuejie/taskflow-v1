let lastId = 0;
const MAX_TIMESTAMP = 8640000000000000;

export function reserveIds(ids) {
  for (const id of ids) {
    const value = Number(id);
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMESTAMP) {
      throw new Error('无法保留无效的时间戳 ID');
    }
    lastId = Math.max(lastId, value);
  }
}

export function genId() {
  const now = Date.now();
  const id = Math.max(now, lastId + 1);
  if (!Number.isSafeInteger(id) || id > MAX_TIMESTAMP) {
    throw new Error('无法生成有效的时间戳 ID');
  }
  lastId = id;
  return String(id);
}
