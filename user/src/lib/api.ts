import { getInitData } from "./telegram";

const BASE_URL = import.meta.env.VITE_API_URL;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-init-data": getInitData(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export function getProfile() {
  return request<{ soul: Record<string, any>; profile: Record<string, any> }>("/panel/profile");
}

export function updateProfile(data: { soul?: Record<string, any>; profile?: Record<string, any> }) {
  return request("/panel/profile", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getUsage() {
  return request<{ total_input: number; total_output: number; by_task: Record<string, number> }>("/panel/usage");
}

export function deleteAccount() {
  return request("/panel/account", { method: "DELETE" });
}

export function getIntegrations() {
  return request<{ gmail: boolean; calendar: boolean; notion: boolean }>("/panel/integrations");
}

export function getOAuthUrl(service: "gmail") {
  return `${BASE_URL}/auth/${service}?initData=${encodeURIComponent(getInitData())}`;
}