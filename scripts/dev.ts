import localtunnel from "localtunnel";

const TELEGRAM_TOKEN = Bun.env.TELEGRAM_TOKEN;
const PORT = 8520;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN no definido en .env");
  process.exit(1);
}

// 1. Primero abre el tunnel y obtiene la URL
console.log("🌐 Levantando tunnel...");
const tunnel = await localtunnel({ port: PORT });
console.log(`🔗 Tunnel activo: ${tunnel.url}`);

tunnel.on("error", (err) => {
  console.error("❌ Error en tunnel:", err);
  process.exit(1);
});

tunnel.on("close", () => {
  console.log("🔌 Tunnel cerrado.");
});

// 2. Inyecta la URL y registra el webhook
process.env.WEBHOOK_URL = tunnel.url;

const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${tunnel.url}/webhook` }),
});

const result = await res.json() as { ok: boolean; description?: string };
result.ok
  ? console.log("✅ Webhook registrado.")
  : console.error("❌ Error registrando webhook:", result.description);

// 3. Arranca el servidor
await import("../src/index");