import { bot } from "@/bot";
import { getPendingAlerts, updateQueueStatus } from "@/services/db";

export async function sendPendingAlerts(userId: number): Promise<void> {
  const alerts = await getPendingAlerts(userId);
  if (alerts.length === 0) return;

  for (const alert of alerts) {
    try {
      await bot.telegram.sendMessage(userId, alert.payload.message, {
        parse_mode: "HTML",
      });
      await updateQueueStatus(alert.id, "sent");
    } catch (err) {
      console.error(`❌ Error enviando alerta ${alert.id} a usuario ${userId}:`, err);
      await updateQueueStatus(alert.id, "failed");
    }
  }
}