import { getInitData } from "./telegram";

const BASE_URL = import.meta.env.VITE_API_URL;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-init-data": getInitData(),
      "bypass-tunnel-reminder": "true",
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export function getProfile() {
  return request<{ soul: Record<string, any>; profile: Record<string, any> }>("/api/panel/profile");
}

export function updateProfile(data: { soul?: Record<string, any>; profile?: Record<string, any> }) {
  return request("/api/panel/profile", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getUsage() {
  return request<{ total_input: number; total_output: number; by_task: Record<string, number> }>("/api/panel/usage");
}

export function deleteAccount() {
  return request("/api/panel/account", { method: "DELETE" });
}

export function getIntegrations() {
  return request<{ gmail: boolean; calendar: boolean; notion: boolean }>("/api/panel/integrations");
}

export function getOAuthUrl() {
  return request<{ url: string }>("/api/auth/gmail/url");
}