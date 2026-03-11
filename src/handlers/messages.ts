import type { Context } from "telegraf";
import { getUser } from "@/services/db";

const WELCOME = `¡Hola! Soy Bridge 🌉, tu nuevo secretario personal.\n\nTe ayudo a tener tu email, tareas y recordatorios al día, para que tengas un control más activo de todo sin esfuerzo.\n\nTodavía estoy en fase privada. Si quieres unirte a la lista de espera, escribe /acceso.`;

export async function handleMessage(ctx: Context) {
  const user = ctx.from!;
  const existing = await getUser(user.id);

  if (!existing) {
    await ctx.reply(WELCOME);
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

  // status: beta o active — aquí irá la lógica principal de Bridge
}