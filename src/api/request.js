import axios from 'axios';
import { ElMessage } from 'element-plus';
import { storageGet, TOKEN_KEY } from '../utils/storage';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

async function handleUnauthorized(msg) {
  const [{ useUserStore }, { default: router }, { useTaskStore }, { useProjectStore }] =
    await Promise.all([
      import('../stores/user'),
      import('../router'),
      import('../stores/task'),
      import('../stores/project'),
    ]);
  const logoutResult = useUserStore().logout();
  useTaskStore().clearTasks();
  useProjectStore().setCurrentProject('');
  ElMessage.error(logoutResult.ok ? msg || '未授权，请重新登录' : logoutResult.reason);
  await router.replace('/login');
}

request.interceptors.request.use(
  (config) => {
    if (config.skipAuth) return config;
    const result = storageGet(TOKEN_KEY);
    if (!result.ok) throw new Error(result.reason);
    if (result.value) {
      config.headers.Authorization = result.value;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  async (response) => {
    const res = response.data;

    if (res.code === 401) {
      await handleUnauthorized(res.msg);
      return Promise.reject(new Error(res.msg || '未授权，请重新登录'));
    }

    if (res.code !== 200) {
      ElMessage.error(res.msg || '请求失败');
      return Promise.reject(new Error(res.msg || 'Error'));
    }

    return res.data;
  },
  async (error) => {
    if (error.response?.status === 401) {
      await handleUnauthorized(error.response.data?.msg);
      return Promise.reject(error);
    }
    ElMessage.error(error.message || '网络异常，请稍后重试');
    return Promise.reject(error);
  }
);

export default request;
