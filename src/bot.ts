import { Telegraf, Markup } from "telegraf";
import { MessageHandler } from "@/handlers/message.handler";

const token = Bun.env.TELEGRAM_TOKEN;
if (!token) throw new Error("TELEGRAM_TOKEN no definido");

export const bot = new Telegraf(token);

// Comandos básicos
bot.start((ctx) =>
  ctx.reply(
    "👋 Hola, soy Bridge, tu secretario personal. ¿En qué puedo ayudarte hoy?",
    Markup.inlineKeyboard([
      [Markup.button.url("🚀 Abrir Dashboard", `https://bridge-dashboard-six.vercel.app/dashboard?chatId=${ctx.chat.id}`)]
    ])
  )
);

// Comando para vincular cuentas
bot.command("conectar", (ctx) => {
  const chatId = ctx.chat.id;
  const dashboardUrl = `https://bridge-dashboard-six.vercel.app/dashboard?chatId=${chatId}`;

  ctx.reply(
    "🔗 Para gestionar tu Notion y Gmail, vincula tus cuentas desde el panel de control:",
    Markup.inlineKeyboard([
      [Markup.button.url("⚙️ Configurar Bridge", dashboardUrl)]
    ])
  );
});

// Delegamos todos los mensajes de texto a nuestro handler
bot.on("text", MessageHandler.handleIncomingText);

// Manejo de botones (callback queries)
bot.on("callback_query", MessageHandler.handleCallback);