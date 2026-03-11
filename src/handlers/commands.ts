import type { Context } from "telegraf";
import { getUser, createUser } from "@/services/db";

const ADMIN_ID = Number(Bun.env.ADMIN_ID);

export async function handleAcceso(ctx: Context) {
  const user = ctx.from!;
  const existing = await getUser(user.id);

  if (existing && existing.status !== "unknown") {
    await ctx.reply("Sigues en la lista de espera. Te avisaré en cuanto haya novedades.");
    return;
  }

  await createUser(user.id, user.username ?? null, user.first_name ?? null);

  await ctx.reply("Listo, te he apuntado en la lista de espera. Te avisaré cuando haya un hueco para ti. 🙌");

  await ctx.telegram.sendMessage(
    ADMIN_ID,
    `👤 Nuevo usuario en waitlist:\n<b>${user.first_name ?? "Sin nombre"}</b> (@${user.username ?? "sin username"})\nID: <code>${user.id}</code>`,
    { parse_mode: "HTML" }
  );
}

export async function handleSoporte(ctx: Context) {
  await ctx.reply("Para recuperar o gestionar tu acceso, contacta con nosotros en @bridgesupport.");
}