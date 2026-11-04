<template>
  <div class="kanban-page">
    <h2>任务看板</h2>

    <ProjectSelect
      :model-value="projectStore.currentProjectId"
      :projects="projectStore.projects"
      :loading="loading"
      :disabled="loading || saving"
      @update:model-value="handleProjectChange"
    />
    <el-alert v-if="loadFailed" title="看板数据加载失败，请重试" type="error" :closable="false">
      <el-button :loading="loading" :disabled="saving" @click="retryLoad"> 重试 </el-button>
    </el-alert>
    <div v-else v-loading="loading || saving" class="kanban-columns">
      <!-- 待办列 -->
      <div class="kanban-column">
        <div class="column-header">
          <span>待办</span>
          <el-badge :value="todoTasks.length" type="info" />
        </div>
        <draggable
          v-model="todoTasks"
          group="tasks"
          item-key="id"
          class="task-list"
          ghost-class="ghost-card"
          animation="200"
          :disabled="loading || saving"
          @change="(evt) => handleChange(evt, 'todo')"
        >
          <template #item="{ element }">
            <TaskCard :task="element" />
          </template>
        </draggable>
      </div>

      <!-- 进行中列 -->
      <div class="kanban-column">
        <div class="column-header">
          <span>进行中</span>
          <el-badge :value="doingTasks.length" type="warning" />
        </div>
        <draggable
          v-model="doingTasks"
          group="tasks"
          item-key="id"
          class="task-list"
          ghost-class="ghost-card"
          animation="200"
          :disabled="loading || saving"
          @change="(evt) => handleChange(evt, 'doing')"
        >
          <template #item="{ element }">
            <TaskCard :task="element" />
          </template>
        </draggable>
      </div>

      <!-- 已完成列 -->
      <div class="kanban-column">
        <div class="column-header">
          <span>已完成</span>
          <el-badge :value="doneTasks.length" type="success" />
        </div>
        <draggable
          v-model="doneTasks"
          group="tasks"
          item-key="id"
          class="task-list"
          ghost-class="ghost-card"
          animation="200"
          :disabled="loading || saving"
          @change="(evt) => handleChange(evt, 'done')"
        >
          <template #item="{ element }">
            <TaskCard :task="element" />
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import draggable from 'vuedraggable';
import TaskCard from '../components/TaskCard.vue';
import { useTaskStore } from '../stores/task';
import { useProjectStore } from '../stores/project.js';
import ProjectSelect from '../components/ProjectSelect.vue';

const taskStore = useTaskStore();
const projectStore = useProjectStore();
const saving = ref(false);
const loadFailed = ref(false);
const loading = ref(false);
let isActive = true;

// 三列本地数组，对应模板里三个 v-model
const todoTasks = ref([]);
const doingTasks = ref([]);
const doneTasks = ref([]);

const syncColumns = (list) => {
  todoTasks.value = list.filter((task) => task.status === 'todo');
  doingTasks.value = list.filter((task) => task.status === 'doing');
  doneTasks.value = list.filter((task) => task.status === 'done');
};

// 监听 store 里的任务列表，一变化就自动按状态分到三个数组
watch(() => taskStore.allTasks, syncColumns, { immediate: true });

// 拖拽完成后触发：只有卡片被拖入这一列时，才更新状态
const handleChange = async (evt, newStatus) => {
  if (evt.added) {
    if (saving.value || loading.value || loadFailed.value || !isActive) {
      syncColumns(taskStore.allTasks);
      return;
    }
    const task = evt.added.element;
    saving.value = true;
    try {
      await taskStore.updateStatus(task.id, newStatus);
      if (!isActive) return;

      try {
        await taskStore.fetchAllForKanban(projectStore.currentProjectId);
      } catch {
        if (isActive) loadFailed.value = true;
      }
    } catch {
      if (isActive) syncColumns(taskStore.allTasks);
    } finally {
      saving.value = false;
    }
  }
};

const handleProjectChange = async (projectId) => {
  if (loading.value || saving.value || !isActive) return;
  if (!projectStore.setCurrentProject(projectId)) return;

  loading.value = true;

  try {
    await taskStore.fetchAllForKanban(projectId);
    if (isActive) loadFailed.value = false;
  } catch {
    if (isActive) loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};
// 页面加载时，先获取项目，再加载当前项目的任务。
const retryLoad = async () => {
  if (loading.value || saving.value || !isActive) return;
  loading.value = true;

  try {
    await projectStore.fetchProjects();
    if (!isActive) return;

    if (!projectStore.setCurrentProject(projectStore.currentProjectId)) {
      projectStore.setCurrentProject('');
    }

    await taskStore.fetchAllForKanban(projectStore.currentProjectId);
    if (isActive) loadFailed.value = false;
  } catch {
    if (isActive) loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

onMounted(retryLoad);
onUnmounted(() => {
  isActive = false;
});
</script>

<style scoped>
.kanban-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.kanban-page h2 {
  margin-bottom: 20px;
}

.kanban-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.kanban-column {
  min-width: 0;
  padding: 16px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 600;
}

.task-list {
  min-height: 160px;
}

.ghost-card {
  opacity: 0.5;
}

@media (max-width: 768px) {
  .kanban-page {
    padding: 16px;
  }

  .kanban-columns {
    grid-template-columns: 1fr;
  }
}
</style>
