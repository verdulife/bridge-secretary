import type { APIRoute } from "astro";
import { client } from "@/lib/db";

const TELEGRAM_TOKEN = import.meta.env.TELEGRAM_TOKEN;

export const POST: APIRoute = async ({ request }) => {
  const { id, action } = await request.json();

  if (!id || !action) {
    return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400 });
  }

  const newStatus = action === "activate" ? "beta" : "blocked";

  await client.execute({
    sql: "UPDATE users SET status = ? WHERE id = ?",
    args: [newStatus, id],
  });

  if (action === "activate") {
    console.log(`📨 Enviando mensaje a ${id} con token ${TELEGRAM_TOKEN?.substring(0, 10)}...`);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        text: "¡Tu acceso a Bridge ha sido activado! 🌉\n\nYa puedes empezar a usarme. Escríbeme cuando quieras.",
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true, status: newStatus }), { status: 200 });
};