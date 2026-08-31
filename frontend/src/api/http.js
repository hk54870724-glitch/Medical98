import axios from 'axios';

const http = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const payload = error.response?.data;
    const message = payload?.message || error.message || '请求失败';
    const e = new Error(message);
    e.code = payload?.code || 'HTTP_ERROR';
    e.status = error.response?.status;
    e.data = payload?.data;
    throw e;
  }
);

export default http;
