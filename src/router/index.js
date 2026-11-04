import { createRouter, createWebHashHistory } from 'vue-router';
import { authGuard } from './guard';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
  { path: '/task-list', name: 'TaskList', component: () => import('../views/TaskList.vue') },
  { path: '/kanban', name: 'Kanban', component: () => import('../views/Kanban.vue') },
  { path: '/stats', name: 'Stats', component: () => import('../views/Stats.vue') },
  { path: '/', redirect: '/task-list' },
  { path: '/projects', name: 'Projects', component: () => import('../views/Projects.vue') },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(authGuard);

export default router;
