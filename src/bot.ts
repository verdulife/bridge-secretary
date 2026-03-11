import { Telegraf } from "telegraf";
import { handleMessage } from "@/handlers/messages";
import { handleAcceso, handleSoporte } from "@/handlers/commands";

if (!Bun.env.TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN no definido en .env");
}

export const bot = new Telegraf(Bun.env.TELEGRAM_TOKEN);

bot.command("acceso", handleAcceso);
bot.command("soporte", handleSoporte);

bot.on("text", handleMessage);