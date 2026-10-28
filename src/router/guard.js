import { storageGet, TOKEN_KEY, DEMO_TOKEN } from '../utils/storage';
import { useUserStore } from '../stores/user';

export function authGuard(to) {
  if (to.path === '/login') return true;
  const user = useUserStore();
  const result = storageGet(TOKEN_KEY);
  if (!result.ok) {
    user.setStorageError(result.reason);
    return '/login';
  }
  return result.value === DEMO_TOKEN && user.token === DEMO_TOKEN ? true : '/login';
}
