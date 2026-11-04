<template>
  <div v-loading="loading">
    <el-form label-position="top" @submit.prevent="handleAddSubtask">
      <el-form-item label="新增子任务">
        <el-input
          v-model="title"
          placeholder="输入子任务标题"
          maxlength="100"
          show-word-limit
          :disabled="submitting || loading"
        />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          native-type="submit"
          :loading="submitting"
          :disabled="loading || Boolean(error)"
        >
          添加子任务
        </el-button>
      </el-form-item>
    </el-form>
    <el-form v-if="editForm" label-position="top" @submit.prevent="handleSaveSubtask">
      <el-form-item label="编辑子任务标题">
        <el-input
          v-model="editForm.title"
          maxlength="100"
          show-word-limit
          :disabled="submitting || loading"
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="editForm.desc"
          type="textarea"
          maxlength="2000"
          show-word-limit
          :disabled="submitting || loading"
        />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          native-type="submit"
          :loading="submitting"
          :disabled="loading || Boolean(error)"
        >
          保存修改
        </el-button>
        <el-button :disabled="submitting" @click="editForm = null">取消编辑</el-button>
      </el-form-item>
    </el-form>

    <div v-if="!loading && !error">
      <p>已完成 {{ progress.done }} / {{ progress.total }} 个子任务</p>
      <el-progress :percentage="progress.percentage" />
    </div>
    <el-alert v-if="error" title="子任务加载失败" type="error" :closable="false" show-icon>
      <span>{{ error }}</span>
      <el-button :disabled="loading" @click="loadSubtasks">重试</el-button>
    </el-alert>

    <el-table v-else :data="subtasks">
      <el-table-column prop="title" label="子任务" min-width="160" show-overflow-tooltip />

      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-checkbox
            :key="`${row.id}-${checkboxKeys[row.id] || 0}`"
            :model-value="row.status === 'done'"
            :disabled="submitting || loading"
            :aria-label="`切换子任务“${row.title}”的完成状态`"
            @change="(value) => handleCompletedChange(row, value)"
          >
            {{ row.status === 'done' ? '已完成' : '待办' }}
          </el-checkbox>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="submitting || loading"
            @click="handleEditSubtask(row)"
          >
            编辑
          </el-button>
          <el-button
            link
            type="danger"
            :disabled="submitting || loading"
            @click="handleDeleteSubtask(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty v-if="!loading" description="暂无子任务" />
      </template>
    </el-table>
  </div>
</template>

<script setup>
import { computed, watch, ref } from 'vue';
import { useTaskStore } from '../stores/task';
import { ElMessage, ElMessageBox } from 'element-plus';
const props = defineProps({
  parentId: { type: String, required: true },
  projectId: { type: String, required: true },
  priority: { type: String, required: true },
});

const emit = defineEmits(['submitting-change']);

const taskStore = useTaskStore();
const title = ref('');
const submitting = ref(false);
const checkboxKeys = ref({});
const editForm = ref(null);

const handleEditSubtask = (task) => {
  if (submitting.value || loading.value || error.value) return;

  editForm.value = {
    id: task.id,
    title: task.title,
    desc: task.desc,
  };
};

const handleDeleteSubtask = async (task) => {
  if (submitting.value || loading.value || error.value) return;

  submitting.value = true;
  emit('submitting-change', true);

  try {
    await ElMessageBox.confirm(`确定删除子任务“${task.title}”吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });

    await taskStore.removeSubtask(props.parentId, task.id);

    if (editForm.value?.id === task.id) {
      editForm.value = null;
    }

    ElMessage.success('子任务删除成功');
  } catch {
    // 用户取消时结束操作；请求失败由请求层统一提示。
  } finally {
    submitting.value = false;
    emit('submitting-change', false);
  }
};

const handleSaveSubtask = async () => {
  if (!editForm.value || submitting.value || loading.value || error.value) return;

  const draft = {
    ...editForm.value,
    title: editForm.value.title.trim(),
  };

  if (!draft.title || draft.title.length > 100) {
    ElMessage.warning('子任务标题请输入 1～100 个字符');
    return;
  }

  if (draft.desc.length > 2000) {
    ElMessage.warning('描述不能超过 2000 个字符');
    return;
  }

  submitting.value = true;
  emit('submitting-change', true);

  try {
    await taskStore.editSubtask(props.parentId, draft.id, draft);
    editForm.value = null;
    ElMessage.success('子任务编辑成功');
  } catch {
    // 请求层统一提示错误，保留编辑草稿便于重试。
  } finally {
    submitting.value = false;
    emit('submitting-change', false);
  }
};

const handleAddSubtask = async () => {
  if (submitting.value || loading.value || error.value) return;

  const value = title.value.trim();

  if (!value || value.length > 100) {
    ElMessage.warning('子任务标题请输入 1～100 个字符');
    return;
  }

  submitting.value = true;
  emit('submitting-change', true);

  try {
    await taskStore.addSubtask(props.parentId, {
      title: value,
      desc: '',
      projectId: props.projectId,
      priority: props.priority,
    });

    title.value = '';
    ElMessage.success('子任务新增成功');
  } catch {
    // 请求层统一提示错误，保留输入便于重试。
  } finally {
    submitting.value = false;
    emit('submitting-change', false);
  }
};

const handleCompletedChange = async (task, completed) => {
  if (submitting.value || loading.value || error.value) return;

  submitting.value = true;
  emit('submitting-change', true);

  try {
    await taskStore.setSubtaskCompleted(props.parentId, task.id, completed);
    ElMessage.success(completed ? '子任务已完成' : '子任务已重新打开');
  } catch {
    // 写失败时原状态值没有变化，重建该复选框以恢复原生勾选外观。
    checkboxKeys.value[task.id] = (checkboxKeys.value[task.id] || 0) + 1;
  } finally {
    submitting.value = false;
    emit('submitting-change', false);
  }
};

const subtasks = computed(() => taskStore.subtasksByParent[props.parentId] || []);
const loading = computed(() => taskStore.subtaskLoading[props.parentId] || false);
const error = computed(() => taskStore.subtaskErrors[props.parentId] || '');
const progress = computed(() => taskStore.subtaskProgress(props.parentId));

const loadSubtasks = () => {
  taskStore.fetchSubtasks(props.parentId).catch(() => {});
};

watch(() => props.parentId, loadSubtasks, { immediate: true });
</script>
