import type { Context, Telegraf } from "telegraf";
import { Markup } from "telegraf";
import { AIService } from "@/services/ai.service";
import { DBService } from "@/services/db.service";
import { GoogleService } from "@/services/google.service";

/**
 * Escapa caracteres especiales para HTML de Telegram.
 */
function escapeHTML(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class MessageHandler {
  /**
   * Maneja mensajes de texto entrantes (Chatbot)
   */
  static async handleIncomingText(ctx: Context) {
    if (!("text" in ctx.message!)) return;

    const userMessage = ctx.message.text;
    const chatId = ctx.chat!.id;
    const user = ctx.from!;

    try {
      await ctx.sendChatAction("typing");
      await DBService.upsertUser(user.id, user.username, user.first_name);
      await DBService.saveMessage(chatId, "user", userMessage);
      const history = await DBService.getChatHistory(chatId, 10);

      const aiResponse = await AIService.analyzeMessage(userMessage, history);
      const { reply, action, params } = aiResponse;

      console.log(`🤖 AI Action: ${action}`, params);

      await DBService.saveMessage(chatId, "assistant", reply);

      if (action === "list_recent_emails" || action === "search_emails") {
        if (reply) await ctx.reply(reply, { parse_mode: "HTML" });

        try {
          let emails = [];
          const isFilterActive = params?.filter && params.filter !== "todo";

          if (action === "list_recent_emails") {
            const count = isFilterActive ? 20 : (params?.count || 5);
            // Primero buscamos en Principal
            emails = await GoogleService.listRecentEmails(user.id, count, "primary");

            // Si hay un filtro específico y no ha salido nada, buscamos en TODO (incluyendo spam/promos)
            if (isFilterActive && emails.length === 0) {
              await ctx.reply("No hay nada en la bandeja principal, buscaré en otras carpetas...");
              await ctx.sendChatAction("typing");
              emails = await GoogleService.listRecentEmails(user.id, count, ""); // "" significa sin filtro de categoría (todo)
            }
          } else {
            // Caso Búsqueda: Tiered search
            emails = await GoogleService.searchEmails(user.id, params?.query, "primary");

            if (emails.length === 0) {
              await ctx.reply("No hay nada en la bandeja principal, buscaré en otras carpetas...");
              await ctx.sendChatAction("typing");
              emails = await GoogleService.searchEmails(user.id, params?.query, "global");
            }
          }

          if (emails.length === 0) {
            await ctx.reply("He buscado en todo tu correo, pero no he encontrado nada relacionado.");
          } else {
            await ctx.sendChatAction("typing");
            const summary = await AIService.summarizeEmails(emails, params?.filter || "todo");

            if (summary.toLowerCase().includes("no he encontrado") || summary.toLowerCase().includes("nada de eso")) {
              await ctx.reply(escapeHTML(summary), { parse_mode: "HTML" });
              return;
            }

            if (params?.show_links) {
              const relevantEmails = emails.filter(e => e.id && summary.includes(e.id)).slice(0, 5);
              const displayEmails = relevantEmails.length > 0 ? relevantEmails : emails.slice(0, 5);

              const buttons = displayEmails.map(e => {
                const cleanSubject = e.subject.length > 30 ? e.subject.substring(0, 27) + "..." : e.subject;
                return [Markup.button.url(`🔗 ${cleanSubject}`, `https://mail.google.com/mail/u/0/#inbox/${e.id}`)];
              });
              await ctx.reply(summary || "No hay nada relevante.", {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard(buttons)
              });
            } else {
              await ctx.reply(summary, { parse_mode: "HTML" });
            }
          }
        } catch (error: any) {
          console.error(`❌ Error en ${action}:`, error);
          if (error.message?.includes("Google account not connected")) {
            await ctx.reply("Aún no has vinculado Gmail. Hazlo en el dashboard con /conectar");
          } else {
            throw error;
          }
        }
      } else if (action === "draft_email") {
        const { recipient_name, recipient_email, draft_content, topic } = params || {};
        if (reply) await ctx.reply(reply, { parse_mode: "HTML" });

        // Recuperamos el borrador actual para no perder el contexto (asunto/cuerpo) si la IA se vuelve perezosa
        let currentDraft = (await DBService.getCurrentDraft(user.id)) || {};

        // Actualizamos con lo que nos pase la IA ahora (si trae algo nuevo)
        if (draft_content) currentDraft.body = draft_content;
        if (topic) currentDraft.subject = topic;
        if (recipient_email) currentDraft.to = recipient_email;

        await DBService.updateCurrentDraft(user.id, currentDraft);

        // Si ya tenemos el email (vía params o vía DB)
        const finalEmail = recipient_email || currentDraft.to;
        if (finalEmail) {
          const draftId = await DBService.saveDraft(chatId, {
            to: finalEmail,
            body: currentDraft.body || draft_content,
            subject: currentDraft.subject || topic || "Sin asunto"
          });
          await ctx.reply(`Vale, tengo el destinatario: <b>${finalEmail}</b>.\n¿Se lo envío ahora?`, {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("✅ Enviar ahora", `send_dr:${draftId}`)],
              [Markup.button.callback("❌ Cancelar", "cancel_send")]
            ])
          });
          return;
        }

        const contacts = await GoogleService.searchContacts(user.id, recipient_name || "");

        if (contacts.length === 0) {
          await ctx.reply(`No he encontrado a nadie llamado "${recipient_name}". ¿Me das su email a mano o pruebo con otro nombre?`);
        } else if (contacts.length === 1) {
          const c = contacts[0]!;
          const draftId = await DBService.saveDraft(chatId, {
            to: c.email,
            body: currentDraft.body || draft_content,
            subject: currentDraft.subject || topic || "Sin asunto"
          });
          await ctx.reply(`He encontrado a <b>${escapeHTML(c.name)}</b> (${c.email}).\n¿Se lo envío?`, {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("✅ Enviar ahora", `send_dr:${draftId}`)],
              [Markup.button.callback("❌ Cancelar", "cancel_send")]
            ])
          });
        } else {
          const draftItems = await Promise.all(contacts.slice(0, 5).map(async (c: any) => {
            const id = await DBService.saveDraft(chatId, {
              to: c.email,
              body: currentDraft.body || draft_content,
              subject: currentDraft.subject || topic || "Sin asunto"
            });
            return { name: c.name, email: c.email, id };
          }));

          const buttons = draftItems.map(item => [
            Markup.button.callback(`👤 ${item.name} (${item.email})`, `prep_dr:${item.id}`)
          ]);
          await ctx.reply("He encontrado varios contactos. ¿A cuál de estos se lo mando?", Markup.inlineKeyboard(buttons));
        }
      } else if (action === "reply_email" && params?.email_id) {
        if (reply) await ctx.reply(reply, { parse_mode: "HTML" });

        // Buscamos el correo original para tener el hilo y el destinatario
        const emails = await GoogleService.searchEmails(user.id, params.email_id, "global");
        const original = emails.find(e => e.id === params.email_id);

        if (!original) {
          await ctx.reply("No encuentro el correo original para responder. ¿Podemos listar los correos otra vez?");
          return;
        }

        const isNoReply = original.from.toLowerCase().includes("no-reply") || original.from.toLowerCase().includes("noreply");
        if (isNoReply) {
          await ctx.reply("⚠️ <b>Ojo:</b> Este correo viene de una dirección 'no-reply'. Si respondo, probablemente nadie lea tu mensaje. ¿Quieres que lo intente de todas formas?", { parse_mode: "HTML" });
        }

        const draftId = await DBService.saveDraft(chatId, { threadId: original.id, to: original.from, body: params.draft_content, subject: original.subject });
        await ctx.reply(`¿Respondo a <b>${escapeHTML(original.from)}</b> con este texto?`, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Responder", `repl_dr:${draftId}`)],
            [Markup.button.callback("❌ Cancelar", "cancel_send")]
          ])
        });
      } else if (action === "delete_email") {
        const { email_id, query } = params || {};

        if (reply) await ctx.reply(reply, { parse_mode: "HTML" });

        let targetId = email_id;

        // Si no tenemos ID pero sí búsqueda, intentamos encontrarlo
        if (!targetId && query) {
          await ctx.sendChatAction("typing");
          const results = await GoogleService.searchEmails(user.id, query);

          if (results.length === 0) {
            await ctx.reply(`He buscado "${query}" pero no he encontrado nada para borrar.`);
            return;
          }

          if (results.length === 1) {
            targetId = results[0]!.id;
            await ctx.reply(`He encontrado el correo: <b>${escapeHTML(results[0]!.subject || "")}</b>. Procedo a borrarlo...`, { parse_mode: "HTML" });
          } else {
            // Varios resultados, preguntamos
            const summary = await AIService.summarizeEmails(results, `Borrando: ${query}`);
            const buttons = results.slice(0, 5).map(e => [
              Markup.button.callback(`🗑️ Borrar: ${e.subject.substring(0, 20)}...`, `delete_email:${e.id}`)
            ]);

            await ctx.reply(`He encontrado varios que coinciden. ¿Cuál de estos borro?\n\n${summary}`, {
              parse_mode: "HTML",
              ...Markup.inlineKeyboard(buttons)
            });
            return;
          }
        }

        if (targetId) {
          const success = await GoogleService.deleteEmail(user.id, targetId);
          if (success) {
            await ctx.reply("✅ Listo, enviado a la papelera.");
          } else {
            await ctx.reply("Vaya, me ha dado un error al intentar borrarlo. ¿Lo intentas tú en Gmail?");
          }
        } else {
          await ctx.reply("Oye, me he liado. ¿Qué correo querías borrar exactamente? No he podido encontrar el ID.");
        }
      } else {
        await ctx.reply(reply, { parse_mode: "HTML" });
      }
    } catch (error: any) {
      console.error("❌ Error en MessageHandler:", error);
      await ctx.reply("Oye, me he liado un poco. ¿Podemos repetir?");
    }
  }

  /**
   * Envía una notificación proactiva de un nuevo correo
   */
  static async sendProactiveAlert(bot: Telegraf, userId: number, email: any, analysis: any) {
    try {
      let message = "";
      const buttons = [];
      const safeSummary = escapeHTML(analysis.summary);

      if (analysis.is_spam) {
        message = `🗑️ <b>Publicidad:</b> ${safeSummary}\n\n<i>¿Quieres que lo borre por ti?</i>`;
        buttons.push([
          Markup.button.callback("🗑️ Borrar correo", `delete_email:${email.id}`),
          Markup.button.url("🔗 Ver", `https://mail.google.com/mail/u/0/#inbox/${email.id}`)
        ]);
      } else if (analysis.important) {
        message = `⭐ <b>Importante:</b> ${safeSummary}`;
        buttons.push([Markup.button.url("🔗 Abrir ahora", `https://mail.google.com/mail/u/0/#inbox/${email.id}`)]);
      } else {
        message = `📩 <b>Nuevo correo:</b> ${safeSummary}`;
        buttons.push([Markup.button.url("🔗 Ver correo", `https://mail.google.com/mail/u/0/#inbox/${email.id}`)]);
      }

      await bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      console.error("❌ Error enviando alerta proactiva:", error);
    }
  }

  /**
   * Maneja las acciones de los botones (callback queries)
   */
  static async handleCallback(ctx: Context) {
    if (!("data" in ctx.callbackQuery!)) return;
    const data = ctx.callbackQuery.data;
    const userId = ctx.from!.id;

    if (data.startsWith("delete_email:")) {
      const emailId = data.split(":")[1] || "";
      await ctx.answerCbQuery("Borrando...");
      if (!emailId) return;

      const success = await GoogleService.deleteEmail(userId, emailId);
      if (success) {
        await ctx.editMessageText("✅ Correo enviado a la papelera.");
      } else {
        await ctx.reply("Vaya, no he podido borrarlo. Inténtalo tú en Gmail.");
      }
    } else if (data.startsWith("send_dr:") || data.startsWith("repl_dr:")) {
      const isReply = data.startsWith("repl_dr:");
      const draftId = data.split(":")[1] || "";
      const draft = await DBService.getDraft(draftId);

      if (!draft) {
        await ctx.reply("Vaya, no encuentro este borrador. ¿Podemos intentarlo de nuevo?");
        return;
      }

      const { to, subject, body, threadId } = draft;
      await ctx.answerCbQuery(isReply ? "Respondiendo..." : "Enviando...");

      let success = false;
      if (isReply && threadId) {
        success = await GoogleService.replyEmail(userId, threadId, threadId, to, subject, body);
      } else {
        success = await GoogleService.sendEmail(userId, to, subject, body);
      }

      if (success) {
        await DBService.updateCurrentDraft(userId, null);
        await ctx.editMessageText(isReply ? "✅ Respuesta enviada." : "✅ Correo enviado correctamente.");
      } else {
        await ctx.reply("Vaya, no he podido enviar el correo. ¿Lo intentas tú en Gmail?");
      }
    } else if (data.startsWith("prep_dr:")) {
      const draftId = data.split(":")[1] || "";
      const draft = await DBService.getDraft(draftId);

      if (!draft) {
        await ctx.reply("Borrador no encontrado.");
        return;
      }

      const { to, body } = draft;
      await ctx.answerCbQuery("Preparado.");
      await ctx.editMessageText(`¿Se lo envío a <b>${escapeHTML(to || "")}</b>?\n\n<i>Texto: ${escapeHTML((body || "").substring(0, 100))}...</i>`, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirmar Envío", `send_dr:${draftId}`)],
          [Markup.button.callback("❌ Cancelar", "cancel_send")]
        ])
      });
    } else if (data === "cancel_send") {
      await DBService.updateCurrentDraft(userId, null);
      await ctx.answerCbQuery("Cancelado.");
      await ctx.editMessageText("Vale, envío cancelado.");
    }
  }
}
