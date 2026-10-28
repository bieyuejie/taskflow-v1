import { defineStore } from 'pinia';
import { getStorageStatus, retryStorage, resetStorage } from '../api/storage';
import { useTaskStore } from './task';

export const useStorageStore = defineStore('storage', {
  state: () => ({
    ready: false,
    reason: '正在读取本地数据',
    canReset: false,
    loading: false,
    revision: 0,
  }),
  actions: {
    async refresh() {
      try {
        const status = await getStorageStatus();
        this.ready = status.ok;
        this.reason = status.reason;
        this.canReset = status.canReset;
      } catch (error) {
        this.ready = false;
        this.reason = error.message;
        this.canReset = false;
        throw error;
      }
    },
    async recover(reset = false) {
      if (this.loading) return;
      this.loading = true;
      try {
        if (reset) await resetStorage();
        else await retryStorage();
        useTaskStore().clearTasks();
        this.revision += 1;
      } finally {
        try {
          await this.refresh();
        } finally {
          this.loading = false;
        }
      }
    },
  },
});
