import { getUnreadEmails, labelEmail } from "@/services/google";
import { classifyEmail } from "@/services/ai";
import { client, enqueue, isEmailQueued } from "@/services/db";
import { sendPendingAlerts } from "@/services/notify";

const INTERVAL = 5 * 60 * 1000; // 5 minutos

async function getActiveUsers(): Promise<{
  id: number;
  google_token: string | null;
  user_profile: string;
}[]> {
  const result = await client.execute({
    sql: `SELECT id, google_token, user_profile FROM users
          WHERE status IN ('beta', 'active')`,
    args: [],
  });

  return result.rows.map(row => ({
    id: row.id as number,
    google_token: row.google_token as string | null,
    user_profile: row.user_profile as string,
  }));
}

function isWithinWorkingHours(profile: Record<string, any>): boolean {
  const hl = profile.hl ?? "09:00-18:00";
  const tz = profile.tz ?? "Europe/Madrid";
  const [start, end] = hl.split("-");
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function getNextWorkdayStart(profile: Record<string, any>): Date {
  const hl = profile.hl ?? "09:00-18:00";
  const tz = profile.tz ?? "Europe/Madrid";
  const start = hl.split("-")[0];
  const [startH, startM] = start.split(":").map(Number);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const formatter = new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(tomorrow);
  const year = Number(parts.find(p => p.type === "year")?.value);
  const month = Number(parts.find(p => p.type === "month")?.value) - 1;
  const day = Number(parts.find(p => p.type === "day")?.value);

  // Encontrar el timestamp UTC que corresponde a startH:startM en la zona del usuario
  const candidate = Date.UTC(year, month, day, startH, startM);
  const offsetMs = new Date(candidate).getTime() - new Date(new Date(candidate).toLocaleString("en-US", { timeZone: tz })).getTime();
  return new Date(candidate + offsetMs);
}

async function processUser(user: { id: number; google_token: string | null; user_profile: string }) {
  // 1. Enviar alertas pendientes siempre
  await sendPendingAlerts(user.id);

  // 2. Procesar Gmail solo si tiene token
  if (!user.google_token) return;

  const tokens = JSON.parse(user.google_token);
  const profile = user.user_profile ? JSON.parse(user.user_profile) : {};

  const onRefresh = async (newTokens: typeof tokens) => {
    await client.execute({
      sql: "UPDATE users SET google_token = ? WHERE id = ?",
      args: [JSON.stringify(newTokens), user.id],
    });
  };

  let emails;
  try {
    emails = await getUnreadEmails(tokens, onRefresh);
  } catch (err) {
    console.error(`❌ Error leyendo emails de usuario ${user.id}:`, err);
    return;
  }

  if (emails.length === 0) return;

  const withinHours = isWithinWorkingHours(profile);
  const informativeAccum: typeof emails = [];

  for (const email of emails) {
    const alreadyQueued = await isEmailQueued(user.id, email.id);
    if (alreadyQueued) continue;

    const { summary, category } = await classifyEmail(user.id, email);

    await labelEmail(tokens, email.id, category, onRefresh);

    if (category === "attention" || category === "pending") {
      await enqueue({
        user_id: user.id,
        type: "alert",
        payload: {
          message: summary,
          email_id: email.id,
          from: email.from,
          subject: email.subject,
          category,
        },
        scheduled_at: withinHours ? undefined : getNextWorkdayStart(profile),
      });
    } else {
      informativeAccum.push(email);
    }
  }

  if (informativeAccum.length > 0) {
    await enqueue({
      user_id: user.id,
      type: "alert",
      payload: {
        message: `Tienes ${informativeAccum.length} emails informativos o spam sin revisar.`,
        emails: informativeAccum.map(e => ({ id: e.id, from: e.from, subject: e.subject })),
        category: "informative_summary",
      },
      scheduled_at: getNextWorkdayStart(profile),
    });
  }
}

async function runWorker() {
  console.log("⚙️ Worker ejecutándose...");
  const users = await getActiveUsers();

  for (const user of users) {
    await processUser(user);
  }
}

export function startWorker() {
  runWorker();
  setInterval(runWorker, INTERVAL);
  console.log("⚙️ Worker iniciado, ciclo cada 5 minutos.");
}