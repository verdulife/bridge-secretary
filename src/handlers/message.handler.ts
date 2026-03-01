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
   * Ejecuta el onboarding pasivo de Bridge. Bloqueante para flujos incompletos.
   */
  private static async checkOnboarding(userId: number, text: string, ctx: Context): Promise<boolean> {
    const context = await DBService.getCurrentContext(userId);

    if (context.onboarding_step === "new") {
      await ctx.reply(`¡Hola! Soy Bridge, tu nuevo secretario personal. 🌉\n\nPara poder ayudarte mejor, me gustaría hacerte un par de preguntas rápidas.\n\nPrimero, ¿cómo prefieres que te llame?`, { parse_mode: "HTML" });
      await DBService.updateCurrentContext(userId, { onboarding_step: "name" });
      return true;
    }

    if (context.onboarding_step === "name") {
      await DBService.updateUserProfile(userId, { n: text });
      await ctx.reply(`Encantado, ${escapeHTML(text)}.\n\nPara no molestarte a deshora, ¿en qué país o región vives? Así sé cuándo es buen momento para avisarte de alertas importantes.`, { parse_mode: "HTML" });
      await DBService.updateCurrentContext(userId, { onboarding_step: "tz" });
      return true;
    }

    if (context.onboarding_step === "tz") {
      await DBService.updateUserProfile(userId, { tz: text });
      await ctx.reply(`Anotado.\n\nSuelo trabajar de 09:00 a 18:00 para no dar la lata fuera de horas de oficina. ¿Te parece bien o prefieres otro horario laboral? (Dime "así está bien" o dame tus horas).`, { parse_mode: "HTML" });
      await DBService.updateCurrentContext(userId, { onboarding_step: "hl" });
      return true;
    }

    if (context.onboarding_step === "hl") {
      const isOk = text.toLowerCase().includes("bien") || text.toLowerCase().includes("vale") || text.toLowerCase().includes("ok");
      if (!isOk) {
        await DBService.updateUserProfile(userId, { hl: text });
      }
      await ctx.reply(`¡Perfecto! Ya estoy listo para empezar. 🎉\n\nPuedes vincular tus cuentas de Google y Notion escribiendo o pulsando el comando /conectar.`, { parse_mode: "HTML" });
      await DBService.updateCurrentContext(userId, { onboarding_step: "complete" });
      return true;
    }

    if (context.onboarding_step === "complete" && context.pending_q && context.pending_q.asked_at) {
      const askedAt = new Date(context.pending_q.asked_at).getTime();
      const now = Date.now();
      if (now - askedAt > 24 * 60 * 60 * 1000) {
        let questionText = "Oye, revisando mis notas veo que me dejé algo tintero hace días. ";
        if (context.pending_q.field === "tz") questionText += "¿Me confirmas tu zona horaria para avisarte a las horas correctas?";
        else if (context.pending_q.field === "hl") questionText += "¿Me confirmas tu horario de trabajo?";
        else questionText += `¿Me confirmas tu ${context.pending_q.field}?`;

        await ctx.reply(`<i>${questionText}</i>`, { parse_mode: "HTML" });
        await DBService.updateCurrentContext(userId, { pending_q: { ...context.pending_q, asked_at: new Date().toISOString() } });
      }
    }

    return false;
  }

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

      const handled = await MessageHandler.checkOnboarding(user.id, userMessage, ctx);
      if (handled) return;

      const userProfile = await DBService.getUserProfile(user.id);
      const currentContext = await DBService.getCurrentContext(user.id);

      await DBService.saveMessage(chatId, "user", userMessage);
      const history = await DBService.getChatHistory(chatId, 20); // Limite de 20 en DBService, pero lo enviamos TODO a AIService

      const aiResponse = await AIService.analyzeMessage(userMessage, history, userProfile, currentContext);
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
      } else if (action === "delete_email") {
        const { email_id, query } = params || {};

        if (reply) await ctx.reply(reply, { parse_mode: "HTML" });

        let targetId = email_id;

        // Validamos que de verdad parezca un ID de Gmail (típicamente 16 caracteres hex) y no una alucinación ("id_del_email")
        if (targetId && !/^[0-9a-fA-F]{15,20}$/.test(targetId)) {
          console.warn(`⚠️ ID inventado por la IA detectado: ${targetId}. Cayendo a búsqueda por query...`);
          targetId = null;
        }

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
    }
  }
}
