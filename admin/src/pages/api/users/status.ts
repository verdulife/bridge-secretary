import type { APIRoute } from "astro";
import { client } from "@/lib/db";

export const POST: APIRoute = async ({ request }) => {
  const { id, status } = await request.json();

  if (!id || !status) {
    return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400 });
  }

  await client.execute({
    sql: "UPDATE users SET status = ? WHERE id = ?",
    args: [status, id],
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};