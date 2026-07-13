import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from '../tokenManager';

const hostname = window.location.hostname;

const backendHost = (hostname === 'localhost' || hostname === '127.0.0.1') 
  ? 'localhost' 
  : hostname;

const API_BASE = import.meta.env.VITE_API_BASE || `http://${backendHost}:8000/api`;
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${backendHost}:8000/ws/dm`;
const WS_GROUP = import.meta.env.VITE_WS_GROUP || `ws://${backendHost}:8000/ws/group`;
const WS_PRESENCE = import.meta.env.VITE_WS_PRESENCE || `ws://${backendHost}:8000/ws/presence`;
const FILE_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.includes('/token/refresh/')) {
      original._retry = true;
      try {
        const res = await axios.post(`${API_BASE}/token/refresh/`);
        const newAccessToken = res.data.access;
        setAccessToken(newAccessToken);
        original.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return axios(original);
      } catch {
        clearAccessToken();
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

export { axios };
export { API_BASE, WS_BASE, WS_GROUP, WS_PRESENCE, FILE_MAX_BYTES };
