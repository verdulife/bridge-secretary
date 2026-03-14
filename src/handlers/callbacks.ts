import type { Context } from "telegraf";
import { archiveEmail, deleteEmail } from "@/services/google";
import { client } from "@/services/db";

export async function handleCallback(ctx: Context) {
  const data = (ctx.callbackQuery as any)?.data as string;
  if (!data) return;

  const [action, emailId] = data.split(":");

  if (!action || !emailId) {
    await ctx.answerCbQuery("Acción no válida.");
    return;
  }

  const userId = ctx.from!.id;

  const result = await client.execute({
    sql: "SELECT google_token FROM users WHERE id = ?",
    args: [userId],
  });

  const googleToken = result.rows[0]?.google_token as string;
  if (!googleToken) {
    await ctx.answerCbQuery("No tienes Gmail conectado.");
    return;
  }

  const tokens = JSON.parse(googleToken);

  if (action === "archive") {
    await archiveEmail(tokens, emailId);
    await ctx.answerCbQuery("Email archivado. ✅");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } else if (action === "delete") {
    await deleteEmail(tokens, emailId);
    await ctx.answerCbQuery("Email eliminado. 🗑️");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  }
}