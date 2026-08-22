import axios from "axios";

const defaultApiBaseUrl = import.meta.env.DEV
  ? "/api"
  : (import.meta.env.VITE_API_URL || `${window.location.origin}/api`);

const API = axios.create({ baseURL: defaultApiBaseUrl });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  }
);

export default API;
