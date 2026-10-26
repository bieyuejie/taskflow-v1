import { defineStore } from 'pinia';
import { getTaskList, createTask, updateTask, deleteTask } from '../api/task';

export const useTaskStore = defineStore('task', {
  state: () => ({
    taskList: [],
    allTasks: [],
    total: 0,
    loading: false,
    requestId: 0,
    query: { keyword: '', status: '', page: 1, pageSize: 10 },
  }),
  getters: {
    statusCounts: (state) =>
      ['todo', 'doing', 'done'].map((status, index) => ({
        name: ['待办', '进行中', '已完成'][index],
        value: state.allTasks.filter((task) => task.status === status).length,
      })),
    priorityCounts: (state) =>
      ['low', 'medium', 'high'].map(
        (priority) => state.allTasks.filter((task) => task.priority === priority).length
      ),
  },
  actions: {
    clearTasks() {
      this.requestId += 1;
      this.taskList = [];
      this.allTasks = [];
      this.total = 0;
      this.loading = false;
      this.query = { keyword: '', status: '', page: 1, pageSize: 10 };
    },
    async fetchTasks() {
      const requestId = ++this.requestId;
      this.loading = true;
      try {
        const res = await getTaskList({ ...this.query });
        if (requestId !== this.requestId) return;
        this.taskList = res.list;
        this.total = res.total;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async addTask(data) {
      await createTask(data);
      await this.fetchTasks();
    },
    async editTask(id, data) {
      await updateTask(id, data);
      await this.fetchTasks();
    },
    async removeTask(id) {
      await deleteTask(id);
      await this.fetchTasks();
    },
    setKeyword(keyword) {
      this.query.keyword = keyword;
      this.query.page = 1;
      return this.fetchTasks();
    },
    setStatus(status) {
      this.query.status = status;
      this.query.page = 1;
      return this.fetchTasks();
    },
    setPage(page) {
      this.query.page = page;
      return this.fetchTasks();
    },
    async fetchAllTasks() {
      const requestId = ++this.requestId;
      this.loading = true;
      try {
        const pageSize = 100;
        let page = 1;
        let total = 0;
        const tasks = [];
        do {
          const res = await getTaskList({ page, pageSize });
          if (requestId !== this.requestId) return;
          tasks.push(...res.list);
          total = res.total;
          if (!res.list.length) break;
          page += 1;
        } while (tasks.length < total);
        this.allTasks = tasks;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    fetchAllForKanban() {
      return this.fetchAllTasks();
    },
    async updateStatus(id, status) {
      const task = await updateTask(id, { status });
      this.allTasks = this.allTasks.map((item) => (item.id === id ? task : item));
    },
  },
});
