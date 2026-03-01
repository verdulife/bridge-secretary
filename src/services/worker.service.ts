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

  private static isWithinWorkingHours(hl?: string, tz?: string): boolean {
    if (!hl || hl === "24/7" || !tz) return true;
    try {
      const [startStr, endStr] = hl.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz });
      const currentHour = parseInt(formatter.format(new Date()), 10);
      return currentHour >= start && currentHour < end;
    } catch (e) {
      return true; // Ante la duda o error al parsear TZ, notificamos
    }
  }

  private static async pollEmails() {
    console.log("🔍 Bridge Worker: Revisando correos pendientes...");

    try {
      const users = await DBService.getUsersWithGoogle();

      for (const user of users) {
        try {
          const profile = await DBService.getUserProfile(user.id);
          const context = await DBService.getCurrentContext(user.id);

          const labels = await GoogleService.ensureBridgeLabels(user.id);
          if (!labels) continue;

          const unreviewed = await GoogleService.getUnreviewedEmails(user.id, labels.revisado);

          if (unreviewed.length > 0) {
            console.log(`📩 ${unreviewed.length} correos no revisados para usuario ${user.id}`);

            let spamCount = 0;
            const alertsToSend = [];

            for (const email of unreviewed) {
              const analysis = await AIService.analyzeProactiveEmail(email);

              // Evitar volver a procesarlo en el siguiente ciclo
              await GoogleService.labelEmail(user.id, email.id, labels.revisado);

              if (analysis.is_spam || email.labelIds.includes("SPAM")) {
                spamCount++;
                continue;
              }

              if (analysis.important) {
                await GoogleService.labelEmail(user.id, email.id, labels.atencion);
                alertsToSend.push({ email, analysis });
              }
            }

            if (spamCount > 0) {
              console.log(`🧹 ${spamCount} correos de spam limpiados para ${user.id}.`);
            }

            if (alertsToSend.length > 0) {
              const inHours = WorkerService.isWithinWorkingHours(profile.hl, profile.tz);

              if (inHours && !context.awaiting) {
                for (const alert of alertsToSend) {
                  await MessageHandler.sendProactiveAlert(this.bot, user.id, alert.email, alert.analysis);
                }
              } else {
                console.log(`⏰ Usuario ${user.id} fuera de horario o en chat. Posponiendo ${alertsToSend.length} alertas.`);
                // En v1 guardado en memoria volatil/logs. v2: guardar en BD pending_alerts
              }
            }
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
