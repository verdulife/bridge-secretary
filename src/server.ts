import { bot } from "@/bot";

const PORT = 8521;

export async function startServer() {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/webhook") {
        const body = await req.json() as any;
        await bot.handleUpdate(body);
        return new Response("OK", { status: 200 });
      }

      return new Response("Bridge is running", { status: 200 });
    },
  });

  console.log(`🌉 Bridge corriendo en puerto ${PORT}`);
}