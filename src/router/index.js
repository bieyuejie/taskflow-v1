import { createRouter, createWebHashHistory } from 'vue-router';
import Login from '../views/Login.vue';
import TaskList from '../views/TaskList.vue';
import Kanban from '../views/Kanban.vue';
import Stats from '../views/Stats.vue';

const routes = [
  { path: '/login', name: 'Login', component: Login },
  { path: '/task-list', name: 'TaskList', component: TaskList },
  { path: '/kanban', name: 'Kanban', component: Kanban },
  { path: '/stats', name: 'Stats', component: Stats },
  { path: '/', redirect: '/task-list' },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

const WHITE_LIST = ['/login'];

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('taskflow_token');
  if (WHITE_LIST.includes(to.path)) {
    next();
  } else if (!token) {
    next('/login');
  } else {
    next();
  }
});

export default router;
