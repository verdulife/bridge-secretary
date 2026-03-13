import { bot } from "@/bot";
import { handlePanel } from "@/handlers/panel";
import { handleAuth } from "@/handlers/auth";
import { join } from "path";

const PORT = Number(Bun.env.PORT);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-init-data, bypass-tunnel-reminder, ngrok-skip-browser-warning",
};

const MIME_TYPES: Record<string, string> = {
  js: "application/javascript",
  css: "text/css",
  html: "text/html",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  json: "application/json",
  woff: "font/woff",
  woff2: "font/woff2",
};

async function serveStatic(pathname: string): Promise<Response> {
  const filePath = pathname === "/panel-app" || pathname === "/panel-app/"
    ? "index.html"
    : pathname.replace("/panel-app/", "");

  const file = Bun.file(join(process.cwd(), "user/dist", filePath));
  const exists = await file.exists();

  if (!exists) {
    const index = Bun.file(join(process.cwd(), "user/dist/index.html"));
    return new Response(index, { headers: { "Content-Type": "text/html" } });
  }

  const ext = filePath.split(".").pop() ?? "";
  return new Response(file, {
    headers: { "Content-Type": MIME_TYPES[ext] ?? "text/plain" },
  });
}

export async function startServer() {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // Preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      // API
      if (url.pathname.startsWith("/api/panel")) {
        const res = await handlePanel(req);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname.startsWith("/api/auth")) {
        const res = await handleAuth(req);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      // Webhook
      if (url.pathname === "/webhook") {
        return bot.handleUpdate(await req.json()).then(() => new Response("ok"));
      }

      // Panel estático
      if (url.pathname.startsWith("/panel-app") || url.pathname.startsWith("/assets/")) {
        return serveStatic(url.pathname);
      }

      return new Response("Bridge is running", { status: 200 });
    }
  });

  console.log(`🌉 Bridge corriendo en puerto ${PORT}`);
}