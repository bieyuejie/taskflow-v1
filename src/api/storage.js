import request from './request';

export const getStorageStatus = () => request.get('/storage/status', { skipAuth: true });
export const retryStorage = () => request.post('/storage/retry', {}, { skipAuth: true });
export const resetStorage = () =>
  request.post('/storage/reset', { confirmed: true }, { skipAuth: true });
