import { DBService } from "./db.service";
import { GoogleService } from "./google.service";
import { AIService } from "./ai.service";
import { MessageHandler } from "../handlers/message.handler";
import type { Telegraf } from "telegraf";

export class WorkerService {
  private static bot: Telegraf;
  private static isRunning = false;

  /**
   * Inicia el vigilante de correos.
   */
  static start(bot: Telegraf) {
    this.bot = bot;
    if (this.isRunning) return;
    this.isRunning = true;

    console.log("🕵️ Bridge Worker: Vigilante de correos activado.");

    // Ejecutar cada 5 minutos
    setInterval(() => this.pollEmails(), 5 * 60 * 1000);

    // Primera ejecución inmediata después de un breve delay
    setTimeout(() => this.pollEmails(), 10000);
  }

  private static async pollEmails() {
    console.log("🔍 Bridge Worker: Revisando bandejas de entrada...");

    try {
      const users = await DBService.getUsersWithGoogle();

      for (const user of users) {
        try {
          const newEmails = await GoogleService.getNewEmails(user.id, user.last_email_id);

          if (newEmails.length > 0) {
            console.log(`📩 ${newEmails.length} correos nuevos para usuario ${user.id}`);

            for (const email of newEmails) {
              // 1. Analizar con IA
              const analysis = await AIService.analyzeProactiveEmail(email);

              // 2. Enviar alerta a Telegram
              await MessageHandler.sendProactiveAlert(this.bot, user.id, email, analysis);
            }

            // 3. Actualizar último ID procesado
            await DBService.updateLastEmailId(user.id, newEmails[newEmails.length - 1].id);
          }
        } catch (err) {
          console.error(`❌ Error polleando correos para usuario ${user.id}:`, err);
        }
      }
    } catch (error) {
      console.error("❌ Error en WorkerService.pollEmails:", error);
    }
  }
}
