<template>
  <div class="projects-page">
    <h2>项目管理</h2>

    <el-button type="primary" :disabled="deletingId !== null || submitting" @click="openCreate">
      新增项目
    </el-button>

    <ProjectDialog
      :visible="dialogVisible"
      :submitting="submitting"
      :project="editingProject"
      @close="dialogVisible = false"
      @submit="handleSubmit"
    />

    <el-alert v-if="loadFailed" title="项目加载失败" type="error" :closable="false">
      <el-button @click="loadProjects">重试</el-button>
    </el-alert>

    <el-table v-else v-loading="projectStore.loading" :data="projectStore.projects">
      <el-table-column prop="name" label="项目名称" min-width="160" />
      <el-table-column prop="desc" label="项目描述" min-width="220" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button :disabled="deletingId !== null || submitting" @click="openEdit(row)">
            编辑
          </el-button>
          <el-button
            type="danger"
            :loading="deletingId === row.id"
            :disabled="deletingId !== null || submitting"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useProjectStore } from '../stores/project';
import ProjectDialog from '../components/ProjectDialog.vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const projectStore = useProjectStore();
const loadFailed = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const editingProject = ref(null);
const deletingId = ref(null);

function openCreate() {
  if (deletingId.value !== null || submitting.value) return;
  editingProject.value = null;
  dialogVisible.value = true;
}

function openEdit(project) {
  if (deletingId.value !== null || submitting.value) return;
  editingProject.value = project;
  dialogVisible.value = true;
}

async function loadProjects() {
  loadFailed.value = false;

  try {
    await projectStore.fetchProjects();
  } catch {
    loadFailed.value = true;
  }
}

async function handleSubmit(data) {
  if (submitting.value || deletingId.value !== null) return;

  submitting.value = true;
  const project = editingProject.value;

  try {
    if (project) {
      await projectStore.editProject(project.id, data);
    } else {
      await projectStore.addProject(data);
    }

    dialogVisible.value = false;
    ElMessage.success(project ? '项目编辑成功' : '项目新增成功');
  } catch {
    // 请求层统一提示错误，保留弹窗内容以便重试。
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(project) {
  if (deletingId.value !== null || submitting.value) return;

  if (projectStore.projects.length <= 1) {
    ElMessage.warning('至少保留一个项目');
    return;
  }

  deletingId.value = project.id;

  try {
    const counts = await projectStore.fetchProjectTaskCounts(project.id);

    await ElMessageBox.confirm(
      `确认删除项目“${project.name}”吗？将同时删除 ${counts.rootCount} 个顶层任务和 ${counts.subtaskCount} 个子任务，此操作无法撤销。`,
      '删除项目',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
        closeOnClickModal: false,
      }
    );

    await projectStore.removeProject(project.id);
    ElMessage.success('项目删除成功');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    // 接口错误由请求层统一提示。
  } finally {
    deletingId.value = null;
  }
}
onMounted(loadProjects);
</script>

<style scoped>
.projects-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .projects-page {
    padding: 16px;
  }
}
</style>
