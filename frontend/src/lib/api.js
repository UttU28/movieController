import axios from "axios";

// Default: same host the phone loaded this page from, backend port 9282.
function baseUrl() {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window === "undefined") return "http://localhost:9282";
  return `${window.location.protocol}//${window.location.hostname}:9282`;
}

const client = axios.create({ timeout: 20000 });

export const getState = async (app) => (await client.get(`${baseUrl()}/state`, { params: { app } })).data;

export const sendAction = async (app, action, value) =>
  (await client.post(`${baseUrl()}/action`, value === undefined ? { app, action } : { app, action, value })).data;

export const sendSearch = async (app, query) => (await client.post(`${baseUrl()}/search`, { app, query })).data;

// Switch Chrome to the app's tab (opening it if needed) and bring it forward.
export const showApp = async (app) => (await client.post(`${baseUrl()}/app`, { app })).data;

export const pointerSocketUrl = () => `${baseUrl().replace(/^http/, "ws")}/ws/pointer`;

export const errorMessage = (err) =>
  err?.response?.data?.detail || (err?.code === "ERR_NETWORK" ? "Can't reach the backend" : err?.message) || "Request failed";

export const getMode = async () => (await client.get(`${baseUrl()}/mode`)).data;

export const setMode = async (mode) => (await client.post(`${baseUrl()}/mode`, { mode })).data;

export const pauseAll = async () => (await client.post(`${baseUrl()}/pause-all`)).data;
