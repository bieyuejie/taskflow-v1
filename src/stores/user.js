import { defineStore } from 'pinia';
import { loginApi } from '../api/user';
import { storageGet, storageSet, storageRemove, TOKEN_KEY } from '../utils/storage';

export const useUserStore = defineStore('user', {
  state: () => {
    const result = storageGet(TOKEN_KEY);
    return {
      username: '',
      token: result.ok ? result.value || '' : '',
      storageError: result.ok ? '' : result.reason,
    };
  },

  getters: {
    isLoggedIn: (state) => !!state.token,
  },

  actions: {
    async login({ username, password }) {
      const res = await loginApi({ username, password });
      const saved = storageSet(TOKEN_KEY, res.token);
      if (!saved.ok) {
        this.storageError = saved.reason;
        throw new Error(saved.reason);
      }
      this.token = res.token;
      this.username = res.username;
      this.storageError = '';
    },

    logout() {
      const result = storageRemove(TOKEN_KEY);
      this.token = '';
      this.username = '';
      this.storageError = result.ok ? '' : result.reason;
      return result;
    },

    setStorageError(reason) {
      this.storageError = reason;
    },
  },
});
