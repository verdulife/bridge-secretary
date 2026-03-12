import { bot } from "@/bot";
import { handlePanel } from "@/handlers/panel";

const PORT = 8520;

export async function startServer() {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname.startsWith("/panel")) {
        return handlePanel(req);
      }

      // webhook de Telegram
      if (url.pathname === "/webhook") {
        return bot.handleUpdate(await req.json()).then(() => new Response("ok"));
      }

      return new Response("Bridge is running", { status: 200 });
    }
  });

  console.log(`🌉 Bridge corriendo en puerto ${PORT}`);
}