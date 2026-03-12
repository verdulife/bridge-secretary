import localtunnel from "localtunnel";

const TELEGRAM_TOKEN = Bun.env.TELEGRAM_TOKEN;
const PORT = Number(Bun.env.PORT);

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN no definido en .env");
  process.exit(1);
}

// 1. Levanta Vite en /user
console.log("⚡ Levantando Panel...");
const vite = Bun.spawn(["bun", "run", "dev"], {
  cwd: "./user",
  stdout: "inherit",
  stderr: "inherit",
});

// 2. Espera a que Vite arranque
await new Promise(r => setTimeout(r, 2000));

// 3. Abre tunnels
console.log("🌐 Levantando tunnels...");
const botTunnel = await localtunnel({ port: PORT, subdomain: "bridge-bot" });
const panelTunnel = await localtunnel({ port: 5173, subdomain: "bridge-panel" });

console.log(`🌉 Bot:   ${botTunnel.url}`);
console.log(`📱 Panel: ${panelTunnel.url}`);

// 4. Obtener IP para tunnel password
const ipRes = await fetch("https://ipv4.icanhazip.com");
const tunnelPassword = (await ipRes.text()).trim();
console.log(`🔑 Panel password: ${tunnelPassword}`);

botTunnel.on("error", (err) => {
  console.error("❌ Error en tunnel del bot:", err);
  process.exit(1);
});

panelTunnel.on("error", (err) => {
  console.error("❌ Error en tunnel del panel:", err);
  process.exit(1);
});

// 5. Inyecta URLs
process.env.BASE_URL = botTunnel.url;
process.env.PANEL_URL = panelTunnel.url;

// 6. Registra webhook de Telegram
const webhookRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${process.env.BASE_URL}/webhook` }),
});
const webhookResult = await webhookRes.json() as { ok: boolean; description?: string };
webhookResult.ok
  ? console.log("✅ Webhook registrado.")
  : console.error("❌ Error registrando webhook:", webhookResult.description);

// 7. Actualiza menu button del bot en Telegram
const menuRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setChatMenuButton`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    menu_button: {
      type: "web_app",
      text: "Panel",
      web_app: { url: panelTunnel.url },
    },
  }),
});
const menuResult = await menuRes.json() as { ok: boolean; description?: string };
menuResult.ok
  ? console.log("✅ Menu button actualizado.")
  : console.error("❌ Error actualizando menu button:", menuResult.description);

// 8. Arranca el servidor
await import("../src/index");

// 9. Limpieza al salir
process.on("exit", () => {
  vite.kill();
  botTunnel.close();
  panelTunnel.close();
});