import ngrok from "@ngrok/ngrok";

const TELEGRAM_TOKEN = Bun.env.TELEGRAM_TOKEN;
const PORT = Number(Bun.env.PORT);

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN no definido en .env");
  process.exit(1);
}

// 3. Abre tunnels
console.log("🌐 Levantando tunnels...");
const tunnel = await ngrok.connect({
  addr: PORT,
  authtoken: Bun.env.NGROK_AUTH_TOKEN,
  domain: Bun.env.NGROK_DOMAIN,
});

const url = tunnel.url()!;
process.env.BASE_URL = url;
process.env.PANEL_URL = `${url}/panel-app`;

console.log(`🌉 Bot:   ${url}`);
console.log(`📱 Panel: ${url}/panel-app`);

// 5. Registra webhook de Telegram
const webhookRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${Bun.env.BASE_URL}/webhook` }),
});
const webhookResult = await webhookRes.json() as { ok: boolean; description?: string };
webhookResult.ok
  ? console.log("✅ Webhook registrado.")
  : console.error("❌ Error registrando webhook:", webhookResult.description);

// 6. Actualiza menu button del bot en Telegram
const menuRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setChatMenuButton`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    menu_button: {
      type: "web_app",
      text: "Panel",
      web_app: { url: Bun.env.PANEL_URL },
    },
  }),
});
const menuResult = await menuRes.json() as { ok: boolean; description?: string };
menuResult.ok
  ? console.log("✅ Menu button actualizado.")
  : console.error("❌ Error actualizando menu button:", menuResult.description);

// 7. Arranca el servidor
await import("../src/index");

// 8. Limpieza al salir
process.on("exit", () => {
  ngrok.disconnect();
});