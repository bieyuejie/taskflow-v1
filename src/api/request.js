import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

async function handleUnauthorized(msg) {
  const [{ useUserStore }, { default: router }, { useTaskStore }] = await Promise.all([
    import('../stores/user'),
    import('../router'),
    import('../stores/task'),
  ]);
  useUserStore().logout();
  useTaskStore().clearTasks();
  ElMessage.error(msg || '未授权，请重新登录');
  await router.replace('/login');
}

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('taskflow_token');
    if (token) {
      config.headers.Authorization = token;
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
