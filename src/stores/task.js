import { defineStore } from 'pinia';
import {
  getTaskList,
  createTask,
  updateTask,
  deleteTask,
  getSubtasks,
  createSubtask,
} from '../api/task';
export const useTaskStore = defineStore('task', {
  state: () => ({
    taskList: [],
    allTasks: [],
    total: 0,
    loading: false,
    listError: '',
    requestId: 0,
    subtasksByParent: {},
    subtaskLoading: {},
    subtaskErrors: {},
    subtaskRequestIds: {},
    nextSubtaskRequestId: 0,
    query: {
      keyword: '',
      status: '',
      projectId: '',
      overdue: false,
      page: 1,
      pageSize: 10,
    },
  }),
  getters: {
    taskSummary: (state) => {
      const total = state.allTasks.length;
      const done = state.allTasks.filter((task) => task.status === 'done').length;

      return {
        total,
        done,
        percentage: total === 0 ? 0 : Math.round((done / total) * 100),
      };
    },
    subtaskProgress: (state) => (parentId) => {
      const subtasks = state.subtasksByParent[parentId] || [];
      const total = subtasks.length;
      const done = subtasks.filter((task) => task.status === 'done').length;

      return {
        total,
        done,
        percentage: total === 0 ? 0 : Math.round((done / total) * 100),
      };
    },
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
      this.listError = '';
      this.subtasksByParent = {};
      this.subtaskLoading = {};
      this.subtaskErrors = {};
      this.subtaskRequestIds = {};
      this.query = {
        keyword: '',
        status: '',
        projectId: '',
        overdue: false,
        page: 1,
        pageSize: 10,
      };
    },
    async fetchTasks() {
      const requestId = ++this.requestId;
      this.loading = true;
      this.listError = '';
      try {
        const res = await getTaskList({ ...this.query });
        if (requestId !== this.requestId) return;
        this.taskList = res.list;
        this.total = res.total;
      } catch (error) {
        if (requestId === this.requestId) {
          this.listError = error.message || '任务加载失败';
        }
        throw error;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async addTask(data) {
      const task = await createTask(data);
      await this.fetchTasks().catch(() => {});
      return task;
    },
    async addSubtask(parentId, data) {
      const task = await createSubtask(parentId, data);

      await Promise.allSettled([this.fetchSubtasks(parentId), this.fetchTasks()]);

      return task;
    },
    async setSubtaskCompleted(parentId, taskId, completed) {
      const task = await updateTask(taskId, {
        parentId,
        status: completed ? 'done' : 'todo',
      });

      await Promise.allSettled([this.fetchSubtasks(parentId), this.fetchTasks()]);

      return task;
    },
    async editSubtask(parentId, taskId, data) {
      const task = await updateTask(taskId, {
        parentId,
        title: data.title,
        desc: data.desc,
      });

      try {
        await this.fetchSubtasks(parentId);
      } catch {
        // 保存已成功，查询错误由清单提示并提供重试。
      }

      return task;
    },
    async removeSubtask(parentId, taskId) {
      await deleteTask(taskId);

      try {
        await this.fetchSubtasks(parentId);
      } catch {
        // 删除已成功，查询错误由清单提示并提供重试。
      }
    },
    async editTask(id, data) {
      const task = await updateTask(id, data);
      await this.fetchTasks().catch(() => {});
      return task;
    },
    async removeTask(id) {
      await deleteTask(id);

      try {
        await this.fetchTasks();
      } catch {
        // 删除已成功，列表显示查询错误并提供重试。
      }
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
    setProjectId(projectId) {
      this.query.projectId = projectId;
      this.query.page = 1;
      return this.fetchTasks();
    },
    setOverdue(overdue) {
      this.query.overdue = overdue;
      this.query.page = 1;
      return this.fetchTasks();
    },
    async fetchSubtaskCount(parentId) {
      if (typeof parentId !== 'string' || !parentId || parentId === 'root') {
        throw new Error('请提供具体的父任务 ID');
      }

      const res = await getSubtasks(parentId, {
        page: 1,
        pageSize: 1,
      });

      return res.total;
    },
    async fetchSubtasks(parentId) {
      if (typeof parentId !== 'string' || !parentId || parentId === 'root') {
        throw new Error('请提供具体的父任务 ID');
      }

      const requestId = ++this.nextSubtaskRequestId;
      this.subtaskRequestIds[parentId] = requestId;
      this.subtaskLoading[parentId] = true;
      this.subtaskErrors[parentId] = '';

      try {
        const list = [];
        const pageSize = 100;
        let page = 1;
        let total = 0;

        do {
          const res = await getSubtasks(parentId, { page, pageSize });

          if (this.subtaskRequestIds[parentId] !== requestId) return;

          list.push(...res.list);
          total = res.total;

          if (res.list.length === 0 && list.length < total) {
            throw new Error('子任务加载不完整，请重试');
          }

          page += 1;
        } while (list.length < total);

        this.subtasksByParent[parentId] = list;
        return list;
      } catch (error) {
        if (this.subtaskRequestIds[parentId] === requestId) {
          this.subtaskErrors[parentId] = error.message || '子任务加载失败';
        }
        throw error;
      } finally {
        if (this.subtaskRequestIds[parentId] === requestId) {
          this.subtaskLoading[parentId] = false;
        }
      }
    },
    setPage(page) {
      this.query.page = page;
      return this.fetchTasks();
    },
    async fetchAllTasks(projectId = '') {
      const requestId = ++this.requestId;
      this.loading = true;
      try {
        const pageSize = 100;
        let page = 1;
        let total = 0;
        const tasks = [];
        do {
          const res = await getTaskList({ page, pageSize, projectId });
          if (requestId !== this.requestId) return;

          tasks.push(...res.list);
          total = res.total;
          if (res.list.length === 0 && tasks.length < total) {
            throw new Error('任务加载不完整，请重试');
          }
          page += 1;
        } while (tasks.length < total);
        this.allTasks = tasks;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    fetchAllForKanban(projectId = '') {
      return this.fetchAllTasks(projectId);
    },
    async updateStatus(id, status) {
      const task = await updateTask(id, { status });
      this.allTasks = this.allTasks.map((item) => (item.id === id ? task : item));
    },
  },
});
