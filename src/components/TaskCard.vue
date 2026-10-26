<template>
  <div class="task-card">
    <div class="task-card-title">{{ task.title }}</div>
    <div class="task-card-desc">{{ task.desc }}</div>
    <el-tag :type="priorityMap[task.priority].type" effect="plain">
      {{ priorityMap[task.priority].label }}
    </el-tag>
  </div>
</template>

<script setup>
defineProps({
  task: {
    type: Object,
    required: true,
  },
});

const priorityMap = {
  low: { label: '低', type: 'info' },
  medium: { label: '中', type: 'warning' },
  high: { label: '高', type: 'danger' },
};
</script>

<style scoped>
.task-card {
  overflow-wrap: anywhere;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  cursor: move;
}

.task-card-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.task-card-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}
</style>
