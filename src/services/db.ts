import { createClient } from "@libsql/client";

const client = createClient({
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