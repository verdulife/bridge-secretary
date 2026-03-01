import { bot } from "@/bot";
import { WorkerService } from "@/services/worker.service";
import type { Update } from "telegraf/types";

const PORT = 8520;

// Iniciar el vigilante de correos
WorkerService.start(bot);

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/webhook" && req.method === "POST") {
      try {
        const body = (await req.json()) as Update;
        console.log("📩 Webhook recibido");
        await bot.handleUpdate(body);
        return new Response("OK");
      } catch (err) {
        console.error("❌ Error procesando el webhook:", err);
        return new Response("Error", { status: 500 });
      }
    }

    return new Response("Bridge Server Active 🚀");
  },
});

console.log(`✅ Bridge escuchando en http://localhost:${PORT}`);