import type { Context } from "telegraf";
import { chat, inferProfile, interpretIntent, normalizeTimezone, normalizeWorkingHours, isValidIANA, summarizeEmails, extractSearchQuery } from "@/services/ai";
import { getUnreadEmails, searchEmails, archiveEmail, deleteEmail } from "@/services/google";
import { getUser, getSoul, getUserProfile, getCurrentContext, updateCurrentContext, updateUserProfile, updateSoul, addMessage, getConversation } from "@/services/db";

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleMessage(ctx: Context) {
  const user = ctx.from!;
  const text = "text" in ctx.message! ? ctx.message.text : "";

  const existing = await getUser(user.id);

  if (!existing) {
    await ctx.reply(`¡Hola! Soy Bridge 🌉, tu nuevo asistente personal.\n\nTe ayudo a tener tu email, tareas y recordatorios al día, para que tengas un control más activo de todo sin esfuerzo.\n\nTodavía estoy en fase privada. Si quieres unirte a la lista de espera, escribe /acceso.`);
    return;
  }

  if (existing.status === "waitlist") {
    await ctx.reply("Sigues en la lista de espera. Te avisaré en cuanto haya novedades.");
    return;
  }

  if (existing.status === "blocked") {
    await ctx.reply("Lo siento, tu acceso a Bridge ha sido suspendido.\n\nSi crees que es un error o quieres más información, escribe /soporte.");
    return;
  }

  await ctx.sendChatAction("typing");

  const [soul, profile, context, history] = await Promise.all([
    getSoul(user.id),
    getUserProfile(user.id),
    getCurrentContext(user.id),
    getConversation(user.id),
  ]);

  // Onboarding
  const onboardingHandled = await handleOnboarding(ctx, user.id, text, soul, profile, context);
  if (onboardingHandled) return;

  // Guardar mensaje del usuario
  await addMessage(user.id, "user", text);

  let finalReply: string;

  if (existing.google_token) {
    const intent = await interpretIntent(user.id, text, ["get_emails", "get_single_email", "conversation"]);
    const tokens = JSON.parse(existing.google_token);

    const onRefresh = async (newTokens: typeof tokens) => {
      const { client } = await import("@/services/db");
      await client.execute({
        sql: "UPDATE users SET google_token = ? WHERE id = ?",
        args: [JSON.stringify(newTokens), user.id],
      });
    };

    if (intent === "get_emails") {
      await ctx.sendChatAction("typing");
      const emails = await getUnreadEmails(tokens, onRefresh);

      if (emails.length === 0) {
        finalReply = "No tienes emails nuevos sin revisar. 📭";
      } else {
        finalReply = await summarizeEmails(user.id, emails);
      }

    } else if (intent === "get_single_email") {
      await ctx.sendChatAction("typing");
      const query = await extractSearchQuery(user.id, text);
      const emails = await searchEmails(tokens, query, onRefresh);

      if (emails.length === 0) {
        finalReply = "No he encontrado ningún email con esos criterios. 📭";
      } else {
        const email = emails[0];
        const summary = await summarizeEmails(user.id, [email]);

        await ctx.reply(escapeHTML(summary), {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: "📬 Abrir", url: `https://mail.google.com/mail/u/0/#inbox/${email.id}` },
              { text: "📦 Archivar", callback_data: `archive:${email.id}` },
              { text: "🗑️ Eliminar", callback_data: `delete:${email.id}` },
            ]],
          },
        });

        await addMessage(user.id, "assistant", summary);
        await updateCurrentContext(user.id, { last_active: new Date().toISOString() });
        return;
      }

    } else {
      finalReply = await chat(user.id, text, history, soul, profile, context);
    }
  } else {
    finalReply = await chat(user.id, text, history, soul, profile, context);
  }

  // Guardar respuesta
  await addMessage(user.id, "assistant", finalReply);

  // Inferir cambios en soul o perfil
  const updates = await inferProfile(user.id, text, soul, profile);
  if (updates.soul && Object.keys(updates.soul).length > 0) await updateSoul(user.id, updates.soul);
  if (updates.profile && Object.keys(updates.profile).length > 0) await updateUserProfile(user.id, updates.profile);

  // Actualizar last_active
  await updateCurrentContext(user.id, { last_active: new Date().toISOString() });

  await ctx.reply(escapeHTML(finalReply), { parse_mode: "HTML" });
}

async function handleOnboarding(ctx: Context, userId: number, text: string, soul: Record<string, any>, profile: Record<string, any>, context: Record<string, any>): Promise<boolean> {
  const step = context.onboarding_step;

  if (step === "new") {
    await ctx.reply(`¡Hola! Soy Bridge, tu asistente personal. 🌉\n\n¿Quieres ponerme un mote?`);
    await updateCurrentContext(userId, { onboarding_step: "name" });
    return true;
  }

  if (step === "name") {
    const intent = await interpretIntent(userId, text, ["yes", "no"]);
    if (intent === "yes") {
      await updateSoul(userId, { name: text, _confirmed: ["name"] });
      await ctx.reply(`¡Me encanta! A partir de ahora me llamaré <b>${text}</b>. 🙌\n\nY tú, ¿cómo te llamas?`, { parse_mode: "HTML" });
    } else {
      await updateSoul(userId, { name: "Bridge", _confirmed: ["name"] });
      await ctx.reply(`¡Como quieras! Seguiré siendo Bridge. 🌉\n\nY tú, ¿cómo te llamas?`);
    }
    await updateCurrentContext(userId, { onboarding_step: "user_name" });
    return true;
  }

  if (step === "user_name") {
    await updateUserProfile(userId, { n: text, _confirmed: ["n"] });
    await ctx.reply(`Encantado, <b>${text}</b>. 😊\n\nPara no molestarte a deshora, ¿en qué país o ciudad vives?`, { parse_mode: "HTML" });
    await updateCurrentContext(userId, { onboarding_step: "tz" });
    return true;
  }

  if (step === "tz") {
    const tz = await normalizeTimezone(userId, text);
    if (!isValidIANA(tz)) {
      await ctx.reply(`No he podido identificar tu zona horaria. ¿Puedes decirme tu ciudad o país?`);
      return true;
    }
    await updateUserProfile(userId, { tz, _confirmed: ["tz"] });
    await ctx.reply(`Anotado.\n\nMi horario por defecto es de 09:00 a 18:00. ¿Te parece bien o prefieres otro horario?`);
    await updateCurrentContext(userId, { onboarding_step: "hl" });
    return true;
  }

  if (step === "hl") {
    const intent = await interpretIntent(userId, text, ["confirm", "custom"]);
    if (intent === "custom") {
      const hl = await normalizeWorkingHours(userId, text);
      await updateUserProfile(userId, { hl, _confirmed: ["tz", "hl"] });
    } else {
      await updateUserProfile(userId, { hl: "09:00-18:00", _confirmed: ["tz", "hl"] });
    }
    await ctx.reply(`¡Todo listo! Ya puedo empezar a ayudarte. 🎉\n\nPuedes vincular tu cuenta de Google desde tu Panel.`);
    await updateCurrentContext(userId, { onboarding_step: "complete" });
    return true;
  }

  return false;
}