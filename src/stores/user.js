import { defineStore } from 'pinia';
import { loginApi } from '../api/user';

export const useUserStore = defineStore('user', {
  state: () => ({
    username: '',
    token: localStorage.getItem('taskflow_token') || '',
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
  },

  actions: {
    async login({ username, password }) {
      const res = await loginApi({ username, password });
      this.token = res.token;
      this.username = res.username;
      localStorage.setItem('taskflow_token', this.token);
    },

    logout() {
      this.token = '';
      this.username = '';
      localStorage.removeItem('taskflow_token');
    },
  },
});
