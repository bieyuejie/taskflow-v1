<template>
  <div class="stats-page">
    <h2>数据统计</h2>
    <el-alert v-if="loadFailed" title="统计数据加载失败" type="error" :closable="false">
      <el-button @click="loadStats">重试</el-button>
    </el-alert>
    <el-empty v-else-if="!taskStore.loading && !taskStore.allTasks.length" description="暂无任务" />
    <div v-loading="taskStore.loading" class="charts-container">
      <div ref="pieChartRef" class="chart-box" role="img" aria-label="任务状态分布饼图"></div>
      <div ref="barChartRef" class="chart-box" role="img" aria-label="任务优先级分布柱状图"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/task';
import { createStatsCharts } from '../utils/statsCharts';

const taskStore = useTaskStore();
const pieChartRef = ref(null);
const barChartRef = ref(null);
const loadFailed = ref(false);
let charts = null;

const loadStats = async () => {
  loadFailed.value = false;
  try {
    await taskStore.fetchAllTasks();
  } catch {
    loadFailed.value = true;
  }
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
