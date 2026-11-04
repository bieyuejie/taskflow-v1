import request from './request';

export function getProjects() {
  return request.get('/projects');
}

export function createProject(data) {
  return request.post('/projects', data);
}

export function updateProject(id, data) {
  return request.put(`/projects/${id}`, data);
}

export function deleteProject(id) {
  return request.delete(`/projects/${id}`);
}

export async function getProjectTaskCounts(projectId) {
  const [all, roots] = await Promise.all([
    request.get('/tasks', {
      params: {
        projectId,
        page: 1,
        pageSize: 1,
      },
    }),
    request.get('/tasks', {
      params: {
        projectId,
        parentId: 'root',
        page: 1,
        pageSize: 1,
      },
    }),
  ]);

  return {
    rootCount: roots.total,
    subtaskCount: all.total - roots.total,
  };
}
