import request from './request';

export function getTaskList(params) {
  return request.get('/tasks', { params });
}

export function createTask(data) {
  return request.post('/tasks', data);
}

export function updateTask(id, data) {
  return request.put(`/tasks/${id}`, data);
}

export function deleteTask(id) {
  return request.delete(`/tasks/${id}`);
}
