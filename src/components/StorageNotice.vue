<template>
  <section v-if="!storage.ready" class="storage-notice" aria-live="polite">
    <el-alert
      :title="storage.reason || '本地数据尚未准备好'"
      type="error"
      :closable="false"
      show-icon
    >
      <div class="storage-actions">
        <el-button :loading="storage.loading" @click="retry">重试读取</el-button>
        <el-button v-if="storage.canReset" type="danger" :disabled="storage.loading" @click="reset">
          重置本地数据
        </el-button>
      </div>
    </el-alert>
  </section>
</template>

<script setup>
import { onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useStorageStore } from '../stores/storage';

const storage = useStorageStore();
const retry = async () => {
  try {
    await storage.recover();
  } catch {
    // 请求层展示失败原因，保留恢复入口。
  }
};
const reset = async () => {
  if (storage.loading) return;
  try {
    await ElMessageBox.confirm(
      '重置将用默认项目和示例任务替换本机 V1 项目及任务数据，此操作不可撤销。',
      '确认重置本地数据',
      { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' }
    );
    await storage.recover(true);
    if (storage.ready) ElMessage.success('本地数据已重置');
  } catch {
    // 取消确认不会调用 API；请求失败由请求层提示。
  }
};
onMounted(() => storage.refresh().catch(() => {}));
</script>

<style scoped>
.storage-notice {
  max-width: 1200px;
  margin: 16px auto;
  padding: 0 16px;
}
.storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}
</style>
