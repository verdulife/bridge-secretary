/**
 * Bridge – Smart Start Script
 *
 * Orden de inicio:
 * 1. Arranca el servidor Bun (src/index.ts)
 * 2. Espera un momento para asegurarse de que el puerto está escuchando
 * 3. Lanza el túnel de Cloudflare y captura la URL generada
 * 4. Registra el webhook de Telegram con la nueva URL
 */

const TELEGRAM_TOKEN = Bun.env.TELEGRAM_TOKEN;
const PORT = 8520;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN no definido en .env");
  process.exit(1);
}

// ── 1. Arranca el servidor Bun ───────────────────────────────────────────────
console.log("🚀 Arrancando servidor Bun...");

const bunProcess = Bun.spawn(["bun", "--watch", "src/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

// Esperamos a que el servidor esté listo antes de levantar el túnel
await Bun.sleep(2000);
console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);

// ── 2. Arranca el túnel y captura la URL ─────────────────────────────────────
console.log("🌐 Levantando túnel de Cloudflare...");

const tunnelUrl = await new Promise<string>((resolve, reject) => {
  const tunnel = Bun.spawn(["cloudflared", "tunnel", "--protocol", "http2", "--url", `http://localhost:${PORT}`], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  // Cloudflare imprime la URL en stderr
  let outputBuffer = "";
  const readStream = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk);
      process.stderr.write(text);
      outputBuffer += text;

      const match = outputBuffer.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
      if (match) {
        // Limpiamos la URL de posibles caracteres de control o invisibles
        const url = match[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
        console.log("\nDEBUG: Captured URL (cleaned):", url);
        resolve(url);
      }
    }
  };

  // Leemos stdout y stderr del túnel
  readStream(tunnel.stdout as ReadableStream<Uint8Array>);
  readStream(tunnel.stderr as ReadableStream<Uint8Array>);

  // Timeout de 30 segundos para obtener la URL
  setTimeout(() => reject(new Error("Timeout: no se obtuvo URL del túnel en 30s")), 30_000);

  // Limpieza al salir
  process.on("exit", () => tunnel.kill());
  process.on("SIGINT", () => { tunnel.kill(); bunProcess.kill(); process.exit(0); });
  process.on("SIGTERM", () => { tunnel.kill(); bunProcess.kill(); process.exit(0); });
});

console.log(`\n🔗 Túnel activo: ${tunnelUrl}`);

// ── 3. Registra el webhook de Telegram ───────────────────────────────────────
const webhookUrl = `${tunnelUrl}/webhook`;

// Esperamos unos segundos para que el DNS de Cloudflare se propague
console.log("⏳ Esperando 5 segundos para que la URL se propague...");
await Bun.sleep(5000);

console.log(`📡 Registrando webhook: ${webhookUrl}`);

let retries = 3;
let success = false;

while (retries > 0 && !success) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );

    const result = (await response.json()) as { ok: boolean; description?: string };

    if (result.ok) {
      console.log(`✅ Webhook registrado correctamente en: ${webhookUrl}`);
      success = true;
    } else {
      console.error(`❌ Intento fallido (${4 - retries}/3):`, result.description);
      if (retries > 1) {
        console.log("Retrayendo en 5 segundos...");
        await Bun.sleep(5000);
      }
    }
  } catch (err) {
    console.error("❌ Error de red al registrar webhook:", err);
  }
  retries--;
}

if (!success) {
  console.error("❌ No se pudo registrar el webhook después de varios intentos.");
}

console.log("\n🟢 Bridge listo. Esperando mensajes de Telegram...\n");

// Mantenemos el proceso vivo
await bunProcess.exited;
