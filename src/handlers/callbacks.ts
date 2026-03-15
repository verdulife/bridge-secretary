import type { Context } from "telegraf";
import { archiveEmail, deleteEmail, archiveEmails, deleteEmails } from "@/services/google";
import { client, getCurrentContext, updateCurrentContext } from "@/services/db";

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

  try {
    if (action === "archive") {
      await archiveEmail(tokens, emailId);
      await ctx.answerCbQuery("✅");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Archivado. 📦");
    } else if (action === "delete") {
      await deleteEmail(tokens, emailId);
      await ctx.answerCbQuery("✅");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Eliminado. 🗑️");
    }
  } catch (err) {
    console.error("❌ Error en callback:", err);
    await ctx.answerCbQuery("Ha ocurrido un error.");
    await ctx.reply("No he podido completar la acción. Inténtalo de nuevo.");
  }

  if (action === "bulk") {
    const context = await getCurrentContext(userId);
    const emailIds = context.pending_bulk as string[] | null;

    if (!emailIds || emailIds.length === 0) {
      await ctx.answerCbQuery("No hay emails pendientes.");
      return;
    }

    try {
      if (emailId === "archive") {
        await archiveEmails(tokens, emailIds);
        await ctx.answerCbQuery("✅");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply(`${emailIds.length} emails archivados. 📦`);
      } else if (emailId === "delete") {
        await deleteEmails(tokens, emailIds);
        await ctx.answerCbQuery("✅");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply(`${emailIds.length} emails eliminados. 🗑️`);
      }
      await updateCurrentContext(userId, { pending_bulk: null });
    } catch (err) {
      console.error("❌ Error en bulk action:", err);
      await ctx.answerCbQuery("Ha ocurrido un error.");
      await ctx.reply("No he podido completar la acción. Inténtalo de nuevo.");
    }
  }
}