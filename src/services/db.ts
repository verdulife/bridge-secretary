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
  google_token: string | null;
  created_at: string;
}

export async function getUser(id: number): Promise<User | null> {
  const result = await client.execute({
    sql: "SELECT id, username, first_name, status, google_token, created_at FROM users WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return {
    id: row.id as number,
    username: row.username as string | null,
    first_name: row.first_name as string | null,
    status: row.status as UserStatus,
    google_token: row.google_token as string | null,
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

export async function getUserProfile(id: number): Promise<Record<string, any>> {
  const result = await client.execute({
    sql: "SELECT user_profile FROM users WHERE id = ?",
    args: [id],
  });
  const profile = result.rows[0]?.user_profile as string;
  return profile ? JSON.parse(profile) : { n: null, tz: null, hl: "09:00-18:00", lang: null, response_speed: null, notification_sensitivity: null };
}

export async function updateSoul(id: number, fields: Record<string, any>): Promise<void> {
  const existing = await getSoul(id);
  const confirmed = existing._confirmed ?? [];
  const merged = { ...existing, ...fields };
  if (fields._confirmed) {
    merged._confirmed = [...new Set([...confirmed, ...fields._confirmed])];
  }
  await client.execute({
    sql: "UPDATE users SET soul = ? WHERE id = ?",
    args: [JSON.stringify(merged), id],
  });
}

export async function updateUserProfile(id: number, fields: Record<string, any>): Promise<void> {
  const existing = await getUserProfile(id);
  const confirmed = existing._confirmed ?? [];
  const merged = { ...existing, ...fields };
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

export async function enqueue(entry: {
  user_id?: number;
  type: "alert" | "internal";
  payload: Record<string, any>;
  action?: Record<string, any>;
  scheduled_at?: Date;
}): Promise<void> {
  await client.execute({
    sql: `INSERT INTO queue (user_id, type, payload, action, scheduled_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      entry.user_id ?? null,
      entry.type,
      JSON.stringify(entry.payload),
      entry.action ? JSON.stringify(entry.action) : null,
      entry.scheduled_at?.toISOString() ?? null,
    ],
  });
}

export async function getPendingAlerts(userId: number): Promise<{
  id: number;
  payload: Record<string, any>;
  action: Record<string, any> | null;
}[]> {
  const result = await client.execute({
    sql: `SELECT id, payload, action FROM queue
          WHERE user_id = ? AND type = 'alert' AND status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
          ORDER BY created_at ASC`,
    args: [userId],
  });

  return result.rows.map(row => ({
    id: row.id as number,
    payload: JSON.parse(row.payload as string),
    action: row.action ? JSON.parse(row.action as string) : null,
  }));
}

export async function getPendingInternals(): Promise<{
  id: number;
  user_id: number | null;
  payload: Record<string, any>;
}[]> {
  const result = await client.execute({
    sql: `SELECT id, user_id, payload FROM queue
          WHERE type = 'internal' AND status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
          ORDER BY created_at ASC`,
    args: [],
  });

  return result.rows.map(row => ({
    id: row.id as number,
    user_id: row.user_id as number | null,
    payload: JSON.parse(row.payload as string),
  }));
}

export async function updateQueueStatus(
  id: number,
  status: "pending" | "sent" | "confirmed" | "rejected" | "done" | "failed"
): Promise<void> {
  await client.execute({
    sql: "UPDATE queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [status, id],
  });
}

export async function isEmailQueued(userId: number, emailId: string): Promise<boolean> {
  // Busca el email_id tanto en alertas individuales ($.email_id)
  // como en resúmenes informativos/spam ($.emails[*].id)
  const result = await client.execute({
    sql: `SELECT id FROM queue
          WHERE user_id = ?
          AND status NOT IN ('done', 'rejected', 'failed')
          AND (
            json_extract(payload, '$.email_id') = ?
            OR EXISTS (
              SELECT 1 FROM json_each(json_extract(payload, '$.emails'))
              WHERE json_extract(value, '$.id') = ?
            )
          )`,
    args: [userId, emailId, emailId],
  });
  return result.rows.length > 0;
}