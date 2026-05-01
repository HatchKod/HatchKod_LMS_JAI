import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "hk_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.upload = (url, file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
