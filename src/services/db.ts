import { createClient } from "@libsql/client";

export const client = createClient({
  url: Bun.env.TURSO_URL!,
  authToken: Bun.env.TURSO_AUTH_TOKEN!,
});

export type UserStatus = "unknown" | "waitlist" | "beta" | "active" | "blocked";

export interface User {
  id: number;
  username: string | null;
  first_name: string | null;
  status: UserStatus;
  created_at: string;
}

export async function getUser(id: number): Promise<User | null> {
  const result = await client.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return {
    id: row.id as number,
    username: row.username as string | null,
    first_name: row.first_name as string | null,
    status: row.status as UserStatus,
    created_at: row.created_at as string,
  };
}

export async function createUser(id: number, username: string | null, first_name: string | null): Promise<void> {
  await client.execute({
    sql: "INSERT INTO users (id, username, first_name, status) VALUES (?, ?, ?, 'waitlist')",
    args: [id, username, first_name],
  });
}

export async function getSoul(id: number): Promise<Record<string, any>> {
  const result = await client.execute({
    sql: "SELECT soul FROM users WHERE id = ?",
    args: [id],
  });
  const soul = result.rows[0]?.soul as string;
  return soul ? JSON.parse(soul) : { name: "Bridge", tone: null, style: null };
}

export async function updateSoul(id: number, fields: Record<string, any>): Promise<void> {
  const existing = await getSoul(id);
  const confirmed = existing._confirmed ?? [];

  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) => !confirmed.includes(key) || key === "_confirmed")
  );

  const merged = { ...existing, ...safeFields };
  if (fields._confirmed) {
    merged._confirmed = [...new Set([...confirmed, ...fields._confirmed])];
  }

  await client.execute({
    sql: "UPDATE users SET soul = ? WHERE id = ?",
    args: [JSON.stringify(merged), id],
  });
}

export async function getUserProfile(id: number): Promise<Record<string, any>> {
  const result = await client.execute({
    sql: "SELECT user_profile FROM users WHERE id = ?",
    args: [id],
  });
  const profile = result.rows[0]?.user_profile as string;
  return profile ? JSON.parse(profile) : { n: null, tz: null, hl: "09:00-18:00", lang: null, response_speed: null, notification_sensitivity: null };
}

export async function updateUserProfile(id: number, fields: Record<string, any>): Promise<void> {
  const existing = await getUserProfile(id);
  const confirmed = existing._confirmed ?? [];

  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) => !confirmed.includes(key) || key === "_confirmed")
  );

  const merged = { ...existing, ...safeFields };
  if (fields._confirmed) {
    merged._confirmed = [...new Set([...confirmed, ...fields._confirmed])];
  }

  await client.execute({
    sql: "UPDATE users SET user_profile = ? WHERE id = ?",
    args: [JSON.stringify(merged), id],
  });
}

export async function getCurrentContext(id: number): Promise<Record<string, any>> {
  const result = await client.execute({
    sql: "SELECT current_context FROM users WHERE id = ?",
    args: [id],
  });
  const context = result.rows[0]?.current_context as string;
  return context ? JSON.parse(context) : { onboarding_step: "new", pending_q: null, last_topic: null, last_active: null, awaiting: null };
}

export async function updateCurrentContext(id: number, fields: Record<string, any>): Promise<void> {
  const existing = await getCurrentContext(id);
  const merged = { ...existing, ...fields };
  await client.execute({
    sql: "UPDATE users SET current_context = ? WHERE id = ?",
    args: [JSON.stringify(merged), id],
  });
}

export async function getConversation(id: number): Promise<{ role: string; content: string }[]> {
  const result = await client.execute({
    sql: "SELECT messages FROM conversations WHERE user_id = ?",
    args: [id],
  });
  const messages = result.rows[0]?.messages as string;
  return messages ? JSON.parse(messages) : [];
}

export async function addMessage(id: number, role: "user" | "assistant", content: string): Promise<void> {
  const messages = await getConversation(id);
  messages.push({ role, content });

  // Límite de 20 mensajes
  if (messages.length > 20) messages.shift();

  await client.execute({
    sql: `INSERT INTO conversations (user_id, messages, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET messages = ?, updated_at = CURRENT_TIMESTAMP`,
    args: [id, JSON.stringify(messages), JSON.stringify(messages)],
  });
}

export async function trackUsage(
  userId: number,
  model: string,
  inputTokens: number,
  outputTokens: number,
  task: string
): Promise<void> {
  await client.execute({
    sql: "INSERT INTO usage (user_id, model, input_tokens, output_tokens, task) VALUES (?, ?, ?, ?, ?)",
    args: [userId, model, inputTokens, outputTokens, task],
  });
}