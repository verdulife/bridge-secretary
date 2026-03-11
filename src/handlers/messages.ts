import type { Context } from "telegraf";
import { getUser, getSoul, getUserProfile, getCurrentContext, updateCurrentContext, updateUserProfile, updateSoul, addMessage, getConversation } from "@/services/db";
import { chat, inferProfile, interpretIntent, normalizeTimezone } from "@/services/ai";

export async function handleMessage(ctx: Context) {
  const user = ctx.from!;
  const text = "text" in ctx.message! ? ctx.message.text : "";

  const existing = await getUser(user.id);

  if (!existing) {
    await ctx.reply(`¡Hola! Soy Bridge 🌉, tu nuevo secretario personal.\n\nTe ayudo a tener tu email, tareas y recordatorios al día, para que tengas un control más activo de todo sin esfuerzo.\n\nTodavía estoy en fase privada. Si quieres unirte a la lista de espera, escribe /acceso.`);
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

  // Usuario activo — lógica principal
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

  // Llamada a Groq
  const reply = await chat(text, history, soul, profile, context);

  // Guardar respuesta
  await addMessage(user.id, "assistant", reply);

  // Inferir cambios en soul o perfil
  const updates = await inferProfile(text, soul, profile);
  if (updates.soul && Object.keys(updates.soul).length > 0) await updateSoul(user.id, updates.soul);
  if (updates.profile && Object.keys(updates.profile).length > 0) await updateUserProfile(user.id, updates.profile);

  // Actualizar last_active
  await updateCurrentContext(user.id, { last_active: new Date().toISOString() });

  await ctx.reply(reply, { parse_mode: "HTML" });
}

async function handleOnboarding(ctx: Context, userId: number, text: string, soul: Record<string, any>, profile: Record<string, any>, context: Record<string, any>): Promise<boolean> {
  const step = context.onboarding_step;

  if (step === "new") {
    await ctx.reply(`¡Bienvenido! Antes de empezar, me gustaría conocerte un poco.\n\n¿Cómo quieres que me llame?`);
    await updateCurrentContext(userId, { onboarding_step: "name" });
    return true;
  }

  if (step === "name") {
    await updateSoul(userId, { name: text, _confirmed: ["name"] });
    await ctx.reply(`Perfecto, me llamaré <b>${text}</b>. 🙌\n\nPara no molestarte a deshora, ¿en qué país o región vives?`, { parse_mode: "HTML" });
    await updateCurrentContext(userId, { onboarding_step: "tz" });
    return true;
  }

  if (step === "tz") {
    const tz = await normalizeTimezone(text);
    await updateUserProfile(userId, { tz, _confirmed: ["tz"] });
    await ctx.reply(`Anotado.\n\nMi horario por defecto es de 09:00 a 18:00. ¿Te parece bien o prefieres otro horario?`);
    await updateCurrentContext(userId, { onboarding_step: "hl" });
    return true;
  }

  if (step === "hl") {
    const intent = await interpretIntent(text, ["confirm", "custom"]);
    if (intent === "custom") {
      await updateUserProfile(userId, { hl: text, _confirmed: ["tz", "hl"] });
    } else {
      await updateCurrentContext(userId, { onboarding_step: "complete" });
    }
    await ctx.reply(`¡Todo listo! Ya puedo empezar a ayudarte. 🎉\n\nPuedes vincular tu cuenta de Google escribiendo /conectar.`);
    await updateCurrentContext(userId, { onboarding_step: "complete" });
    return true;
  }

  return false;
}