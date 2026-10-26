<template>
  <div class="task-list-page">
    <div class="page-header">
      <div>
        <h2>任务列表</h2>
        <p>共 {{ taskStore.total }} 个任务</p>
      </div>
      <el-button type="primary" @click="handleAdd">新增任务</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索任务标题"
        clearable
        class="search-input"
        @input="onSearch"
      />
      <el-select
        v-model="status"
        placeholder="按状态筛选"
        clearable
        class="status-select"
        @change="onFilter"
      >
        <el-option label="待办" value="todo" />
        <el-option label="进行中" value="doing" />
        <el-option label="已完成" value="done" />
      </el-select>
    </div>

    <el-table v-loading="taskStore.loading" :data="taskStore.taskList" border stripe>
      <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
      <el-table-column prop="desc" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column label="状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusMap[row.status].type">
            {{ statusMap[row.status].label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="优先级" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="priorityMap[row.priority].type" effect="plain">
            {{ priorityMap[row.priority].label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatTime(row.createTime) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="Boolean(deletingTaskId)"
            @click="handleEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            link
            type="danger"
            :loading="deletingTaskId === row.id"
            :disabled="Boolean(deletingTaskId)"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无任务" />
      </template>
    </el-table>

    <el-pagination
      v-if="taskStore.total > taskStore.query.pageSize"
      class="pagination"
      background
      layout="prev, pager, next, total"
      :current-page="taskStore.query.page"
      :page-size="taskStore.query.pageSize"
      :total="taskStore.total"
      :disabled="taskStore.loading"
      @current-change="handlePageChange"
    />

    <TaskDialog
      :visible="dialogVisible"
      :task="currentTask"
      :submitting="submitting"
      @submit="handleSubmit"
      @close="handleDialogClose"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import TaskDialog from '../components/TaskDialog.vue';
import { useTaskStore } from '../stores/task';
import { debounce } from '../utils/debounce';

const taskStore = useTaskStore();

const keyword = ref(taskStore.query.keyword);
const status = ref(taskStore.query.status);
const dialogVisible = ref(false);
const currentTask = ref(null);
const submitting = ref(false);
const deletingTaskId = ref('');
let isActive = true;

const statusMap = {
  todo: { label: '待办', type: 'info' },
  doing: { label: '进行中', type: 'warning' },
  done: { label: '已完成', type: 'success' },
};

const priorityMap = {
  low: { label: '低', type: 'info' },
  medium: { label: '中', type: 'warning' },
  high: { label: '高', type: 'danger' },
};

const onSearch = debounce(() => {
  if (!isActive) return;
  taskStore.setKeyword(keyword.value.trim()).catch(() => {});
}, 300);

const onFilter = () => {
  taskStore.setStatus(status.value).catch(() => {});
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
};

const handleAdd = () => {
  currentTask.value = null;
  dialogVisible.value = true;
};

const handleEdit = (task) => {
  currentTask.value = task;
  dialogVisible.value = true;
};

const handleDialogClose = () => {
  dialogVisible.value = false;
  currentTask.value = null;
};

const handleSubmit = async (form) => {
  if (submitting.value) return;

  const editingTaskId = currentTask.value?.id;
  submitting.value = true;

  try {
    if (editingTaskId) {
      await taskStore.editTask(editingTaskId, form);
      ElMessage.success('任务编辑成功');
    } else {
      await taskStore.addTask(form);

      if (taskStore.query.page > 1) {
        await taskStore.setPage(1);
      }

      ElMessage.success('任务新增成功');
    }
    handleDialogClose();
  } catch {
    // 请求层会统一展示错误信息，弹窗保持打开便于用户修改后重试。
  } finally {
    submitting.value = false;
  }
};

const handleDelete = async (task) => {
  if (deletingTaskId.value) return;

  try {
    await ElMessageBox.confirm(`确定删除任务“${task.title}”吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });

    deletingTaskId.value = task.id;
    await taskStore.removeTask(task.id);

    if (taskStore.taskList.length === 0 && taskStore.query.page > 1) {
      await taskStore.setPage(taskStore.query.page - 1);
    }

    ElMessage.success('任务删除成功');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      // 请求层会统一展示错误信息。
    }
  } finally {
    deletingTaskId.value = '';
  }
};

const handlePageChange = (page) => {
  taskStore.setPage(page).catch(() => {});
};

onMounted(async () => {
  try {
    await taskStore.fetchTasks();
  } catch {
    // 请求层会统一展示错误信息。
  }
});

onUnmounted(() => {
  isActive = false;
});
</script>

<style scoped>
.task-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin-bottom: 6px;
}

.page-header p {
  color: #909399;
  font-size: 14px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.search-input {
  width: 240px;
}

.status-select {
  width: 160px;
}

.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .task-list-page {
    padding: 16px;
  }

  .toolbar {
    flex-direction: column;
  }

  .search-input,
  .status-select {
    width: 100%;
  }

  .pagination {
    justify-content: center;
    flex-wrap: wrap;
    row-gap: 8px;
  }
}
</style>
