import { bot } from "@/bot";
import { handlePanel } from "@/handlers/panel";

const PORT = 8520;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-init-data",
};

export async function startServer() {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // Preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (url.pathname.startsWith("/panel")) {
        const res = await handlePanel(req);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === "/webhook") {
        return bot.handleUpdate(await req.json()).then(() => new Response("ok"));
      }

      return new Response("Bridge is running", { status: 200 });
    }
  });

  console.log(`🌉 Bridge corriendo en puerto ${PORT}`);
}