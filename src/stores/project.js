import { defineStore } from 'pinia';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectTaskCounts,
} from '../api/project';

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [],
    loading: false,
    currentProjectId: '',
    requestId: 0,
  }),

  actions: {
    async fetchProjects() {
      const requestId = ++this.requestId;
      this.loading = true;

      try {
        const projects = await getProjects();
        if (requestId === this.requestId) this.projects = projects;
      } catch (error) {
        if (requestId === this.requestId) throw error;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async addProject(data) {
      const project = await createProject(data);
      this.requestId += 1;
      this.loading = false;
      this.projects.push(project);
      return project;
    },

    async editProject(id, data) {
      const project = await updateProject(id, data);
      this.requestId += 1;
      this.loading = false;

      const index = this.projects.findIndex((item) => item.id === id);

      if (index !== -1) {
        this.projects[index] = project;
      }

      return project;
    },

    async removeProject(id) {
      await deleteProject(id);
      this.requestId += 1;
      this.loading = false;

      this.projects = this.projects.filter((project) => project.id !== id);
      if (this.currentProjectId === id) this.currentProjectId = '';
    },

    async fetchProjectTaskCounts(id) {
      return getProjectTaskCounts(id);
    },

    setCurrentProject(id) {
      if (id !== '' && !this.projects.some((project) => project.id === id)) {
        return false;
      }

      this.currentProjectId = id;
      return true;
    },
  },
});
