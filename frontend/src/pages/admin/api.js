import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Thin axios wrapper. The global 401 interceptor (App.js) handles auth expiry; callers
// handle 403 (non-admin) and other errors with toasts.
export const adminApi = {
  get: (path, params) => axios.get(`${API}${path}`, { headers: authHeaders(), params }),
  post: (path, body) => axios.post(`${API}${path}`, body, { headers: authHeaders() }),
  put: (path, body) => axios.put(`${API}${path}`, body, { headers: authHeaders() }),
  del: (path) => axios.delete(`${API}${path}`, { headers: authHeaders() }),
};
