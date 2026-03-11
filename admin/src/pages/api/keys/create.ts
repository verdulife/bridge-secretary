import type { APIRoute } from "astro";
import { client } from "@/lib/db";

function generateKey(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const POST: APIRoute = async ({ request }) => {
  const { created_by } = await request.json();

  const key = generateKey();

  await client.execute({
    sql: "INSERT INTO invite_keys (key, created_by) VALUES (?, ?)",
    args: [key, created_by],
  });

  return new Response(JSON.stringify({ ok: true, key }), { status: 200 });
};