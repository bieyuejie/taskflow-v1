export function isDueDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error('本地日期无效');
  }
  return [year, date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

export function toLocalDate(value) {
  if (value === null) return null;
  if (!isDueDate(value)) throw new Error('截止日期无效');
  const [year, month, day] = value.split('-').map(Number);
  // setFullYear 保留 0001～0099，避免按多参数 Date 构造时映射到 1900 年。
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isOverdue(task, today = getLocalDate()) {
  return (
    task.parentId === null &&
    task.status !== 'done' &&
    typeof task.dueDate === 'string' &&
    isDueDate(task.dueDate) &&
    task.dueDate < today
  );
}
