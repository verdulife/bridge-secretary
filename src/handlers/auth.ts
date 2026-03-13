import { exchangeCode } from "@/services/google";
import { client } from "@/services/db";
import { verifyInitData } from "@/middleware/telegram";

export async function handleAuth(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /auth/gmail/url — devuelve la URL de OAuth
  if (path === "/api/auth/gmail/url" && req.method === "GET") {
    const initData = req.headers.get("x-init-data") ?? "";
    const { valid, userId } = verifyInitData(initData);

    if (!valid || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { getAuthUrl } = await import("@/services/google");
    const url = getAuthUrl(userId);
    return Response.json({ url });
  }

  // GET /auth/gmail/callback — recibe el código de Google
  if (path === "/api/auth/gmail/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("state");

    if (!code || !userId) {
      return new Response("Faltan parámetros", { status: 400 });
    }

    try {
      const tokens = await exchangeCode(code);

      await client.execute({
        sql: "UPDATE users SET google_token = ? WHERE id = ?",
        args: [JSON.stringify(tokens), Number(userId)],
      });

      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Conectado</title>
            <style>
              body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a1a; color: #fff; text-align: center; }
              h1 { font-size: 2rem; margin-bottom: 0.5rem; }
              p { color: #888; }
            </style>
          </head>
          <body>
            <div>
              <h1>✅ Gmail conectado</h1>
              <p>Puedes volver a Telegram.</p>
            </div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    } catch (err) {
      console.error("OAuth error:", err);
      return new Response("Error al conectar Gmail", { status: 500 });
    }
  }

  return new Response("Not found", { status: 404 });
}