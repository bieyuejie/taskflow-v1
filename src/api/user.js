import request from './request';

export function loginApi(data) {
  return request.post('/login', data);
}
