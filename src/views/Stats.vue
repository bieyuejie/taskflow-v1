<template>
  <div class="stats-page">
    <h2>数据统计</h2>
    <ProjectSelect
      :model-value="projectStore.currentProjectId"
      :projects="projectStore.projects"
      :loading="loading"
      :disabled="loading"
      @update:model-value="handleProjectChange"
    />
    <el-alert v-if="loadFailed" title="统计数据加载失败" type="error" :closable="false">
      <el-button :loading="loading" @click="loadStats"> 重试 </el-button>
    </el-alert>
    <el-empty v-else-if="!loading && !taskStore.allTasks.length" description="暂无任务" />

    <el-descriptions v-show="!loadFailed" v-loading="loading" title="任务汇总" :column="1" border>
      <el-descriptions-item label="任务总数">
        {{ taskStore.taskSummary.total }}
      </el-descriptions-item>

      <el-descriptions-item label="已完成">
        {{ taskStore.taskSummary.done }}
      </el-descriptions-item>

      <el-descriptions-item label="完成率">
        {{ taskStore.taskSummary.percentage }}%
      </el-descriptions-item>
    </el-descriptions>
    <div v-show="!loadFailed" v-loading="loading" class="charts-container">
      <div ref="pieChartRef" class="chart-box" role="img" aria-label="任务状态分布饼图"></div>
      <div ref="barChartRef" class="chart-box" role="img" aria-label="任务优先级分布柱状图"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/task';
import { createStatsCharts } from '../utils/statsCharts';
import { useProjectStore } from '../stores/project';
import ProjectSelect from '../components/ProjectSelect.vue';

const taskStore = useTaskStore();
const projectStore = useProjectStore();
const pieChartRef = ref(null);
const barChartRef = ref(null);
const loadFailed = ref(false);
const loading = ref(false);
let charts = null;
let isActive = true;

const loadStats = async () => {
  if (loading.value || !isActive) return;
  loading.value = true;

  try {
    await projectStore.fetchProjects();
    if (!isActive) return;

    if (!projectStore.setCurrentProject(projectStore.currentProjectId)) {
      projectStore.setCurrentProject('');
    }

    await taskStore.fetchAllTasks(projectStore.currentProjectId);
    if (isActive) loadFailed.value = false;
  } catch {
    if (isActive) loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

const handleProjectChange = async (projectId) => {
  if (loading.value || !isActive) return;
  if (!projectStore.setCurrentProject(projectId)) return;

  await loadStats();
};
watch(
  () => [taskStore.statusCounts, taskStore.priorityCounts],
  ([statusCounts, priorityCounts]) => charts?.update(statusCounts, priorityCounts)
);
onMounted(() => {
  charts = createStatsCharts(pieChartRef.value, barChartRef.value);
  charts.update(taskStore.statusCounts, taskStore.priorityCounts);
  loadStats();
});
onUnmounted(() => {
  isActive = false;
  charts?.dispose();
  charts = null;
});
</script>

<style scoped>
.stats-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.stats-page h2 {
  margin-bottom: 20px;
}
.chart-box {
  min-width: 0;
  width: 100%;
  height: 400px;
}
.charts-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 768px) {
  .stats-page {
    padding: 16px;
  }
  .charts-container {
    grid-template-columns: 1fr;
  }
}
</style>
