<template>
  <header v-if="route.path !== '/login'" class="app-header">
    <strong>TaskFlow</strong>
    <nav aria-label="主导航">
      <router-link to="/task-list">任务列表</router-link>
      <router-link to="/kanban">任务看板</router-link>
      <router-link to="/stats">数据统计</router-link>
    </nav>
    <el-button @click="logout">退出登录</el-button>
  </header>
  <router-view />
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from './stores/user';
import { useTaskStore } from './stores/task';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const taskStore = useTaskStore();
const logout = () => {
  userStore.logout();
  taskStore.clearTasks();
  router.replace('/login');
};
</script>

<style scoped>
.app-header {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--el-border-color);
}
nav {
  display: flex;
  flex: 1;
  gap: 16px;
  flex-wrap: wrap;
}
nav a {
  color: var(--el-text-color-regular);
  text-decoration: none;
}
nav a.router-link-active {
  color: var(--el-color-primary);
}
@media (max-width: 768px) {
  .app-header {
    padding: 16px;
  }
  nav {
    order: 1;
    flex-basis: 100%;
  }
}
</style>
