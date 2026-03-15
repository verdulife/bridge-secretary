import type { Context } from "telegraf";
import { archiveEmail, deleteEmail, archiveEmails, deleteEmails, moveEmailsToFolder, deleteFolder } from "@/services/google";
import { client, getCurrentContext, updateCurrentContext } from "@/services/db";

export async function handleCallback(ctx: Context) {
  const data = (ctx.callbackQuery as any)?.data as string;
  if (!data) return;

  const [action, param] = data.split(":");

  if (!action) {
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

  // Confirmaciones awaiting
  if (action === "awaiting") {
    const context = await getCurrentContext(userId);
    const awaiting = context.awaiting as {
      action: string;
      emailIds: string[];
      description: string;
      folder?: string;
    } | null;

    if (!awaiting) {
      await ctx.answerCbQuery("No hay ninguna acción pendiente.");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return;
    }

    if (param === "cancel") {
      await updateCurrentContext(userId, { awaiting: null });
      await ctx.answerCbQuery("Cancelado.");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Cancelado. ¿Algo más?");
      return;
    }

    if (param === "confirm") {
      try {
        if (awaiting.action === "archive_emails") {
          await archiveEmails(tokens, awaiting.emailIds);
          await ctx.answerCbQuery("✅");
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(
            awaiting.emailIds.length === 1
              ? "Archivado. 📦"
              : `${awaiting.emailIds.length} emails archivados. 📦`
          );
        } else if (awaiting.action === "delete_emails") {
          await deleteEmails(tokens, awaiting.emailIds);
          await ctx.answerCbQuery("✅");
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(
            awaiting.emailIds.length === 1
              ? "Eliminado. 🗑️"
              : `${awaiting.emailIds.length} emails eliminados. 🗑️`
          );
        } else if (awaiting.action === "move_emails" && awaiting.folder) {
          await moveEmailsToFolder(tokens, awaiting.emailIds, awaiting.folder);
          await ctx.answerCbQuery("✅");
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(
            awaiting.emailIds.length === 1
              ? `Movido a <b>${awaiting.folder}</b>. 📁`
              : `${awaiting.emailIds.length} emails movidos a <b>${awaiting.folder}</b>. 📁`,
            { parse_mode: "HTML" }
          );
        } else if (awaiting.action === "delete_folder" && awaiting.folder) {
          await deleteFolder(tokens, awaiting.folder);
          await ctx.answerCbQuery("✅");
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(`Carpeta <b>${awaiting.folder}</b> eliminada. 🗑️`, { parse_mode: "HTML" });
        }
      } catch (err) {
        console.error("❌ Error ejecutando awaiting action:", err);
        await ctx.answerCbQuery("Ha ocurrido un error.");
        await ctx.reply("No he podido completar la acción. Inténtalo de nuevo.");
      } finally {
        await updateCurrentContext(userId, { awaiting: null });
      }
    }

    return;
  }

  // Botones inline individuales
  if (!param) {
    await ctx.answerCbQuery("Acción no válida.");
    return;
  }

  try {
    if (action === "archive") {
      await archiveEmail(tokens, param);
      await ctx.answerCbQuery("✅");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Archivado. 📦");
    } else if (action === "delete") {
      await deleteEmail(tokens, param);
      await ctx.answerCbQuery("✅");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Eliminado. 🗑️");
    }
  } catch (err) {
    console.error("❌ Error en callback:", err);
    await ctx.answerCbQuery("Ha ocurrido un error.");
    await ctx.reply("No he podido completar la acción. Inténtalo de nuevo.");
  }

  // Acciones en masa
  if (action === "bulk") {
    const context = await getCurrentContext(userId);
    const emailIds = context.pending_bulk as string[] | null;

    if (!emailIds || emailIds.length === 0) {
      await ctx.answerCbQuery("No hay emails pendientes.");
      return;
    }

    try {
      if (param === "archive") {
        await archiveEmails(tokens, emailIds);
        await ctx.answerCbQuery("✅");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply(`${emailIds.length} emails archivados. 📦`);
      } else if (param === "delete") {
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