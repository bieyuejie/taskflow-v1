<template>
  <div class="kanban-page">
    <h2>任务看板</h2>

    <div v-loading="taskStore.loading" class="kanban-columns">
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
          :disabled="taskStore.loading || saving"
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
          :disabled="taskStore.loading || saving"
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
          :disabled="taskStore.loading || saving"
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
import { ref, watch, onMounted } from 'vue';
import draggable from 'vuedraggable';
import TaskCard from '../components/TaskCard.vue';
import { useTaskStore } from '../stores/task';

const taskStore = useTaskStore();
const saving = ref(false);

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
    const task = evt.added.element;
    saving.value = true;
    try {
      await taskStore.updateStatus(task.id, newStatus);
      await taskStore.fetchAllForKanban();
    } catch {
      // 请求层会统一展示错误信息，恢复为 Store 中的最后一次有效状态。
      syncColumns(taskStore.allTasks);
    } finally {
      saving.value = false;
    }
  }
};

// 页面加载时，拉取所有任务
onMounted(async () => {
  try {
    await taskStore.fetchAllForKanban();
  } catch {
    // 请求层会统一展示错误信息。
  }
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
