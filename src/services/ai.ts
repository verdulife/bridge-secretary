import Groq from "groq-sdk";
import { BASE_PROMPT } from "@/prompts/base";
import { trackUsage } from "@/services/db";

const groq = new Groq({ apiKey: Bun.env.GROQ_API_KEY });

const MODEL_LARGE = "llama-3.3-70b-versatile";
const MODEL_SMALL = "llama-3.1-8b-instant";

function buildSystemPrompt(soul: Record<string, any>, profile: Record<string, any>, context: Record<string, any>, instructions: string): string {
  const now = new Date().toLocaleString("es-ES");

  return `${instructions}

SOUL: ${JSON.stringify(soul)}
PROFILE: ${JSON.stringify(profile)}
CONTEXT: ${JSON.stringify(context)}
SYSTEM: {"datetime":"${now}","user_name":"${profile.n ?? "desconocido"}"}

IMPORTANTE: El campo datetime del SYSTEM es la fecha y hora REAL y ACTUAL del usuario. Tienes acceso a ella y puedes usarla con total confianza. Nunca digas que no tienes acceso a la hora o fecha.`;
}

export async function chat(
  userId: number,
  message: string,
  history: { role: string; content: string }[],
  soul: Record<string, any>,
  profile: Record<string, any>,
  context: Record<string, any>
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL_LARGE,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(soul, profile, context, `${BASE_PROMPT}\n\nTu nombre es ${soul.name ?? "Bridge"}.`)
      },
      ...history as any,
      { role: "user", content: message }
    ]
  });

  await trackUsage(
    userId,
    MODEL_LARGE,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "chat"
  );

  return response.choices[0]?.message.content ?? "No he podido procesar tu mensaje.";
}

export async function classifyEmail(
  userId: number,
  email: { from: string; subject: string; snippet: string }
): Promise<{ summary: string; important: boolean; is_spam: boolean }> {
  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Clasifica este email. Responde SOLO en JSON:
{"summary":"resumen en una frase","important":boolean,"is_spam":boolean}`
      },
      {
        role: "user",
        content: `De: ${email.from}\nAsunto: ${email.subject}\nSnippet: ${email.snippet}`
      }
    ]
  });

  await trackUsage(
    userId,
    MODEL_SMALL,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "classify_email"
  );

  try {
    return JSON.parse(response.choices[0]?.message.content ?? "{}");
  } catch {
    return { summary: "Nuevo correo recibido.", important: false, is_spam: false };
  }
}

export async function summarizeEmails(
  userId: number,
  emails: { from: string; subject: string; snippet: string }[]
): Promise<string> {
  const emailList = emails.map((e, i) => `${i + 1}. De: ${e.from} | Asunto: ${e.subject} | ${e.snippet}`).join("\n");

  const response = await groq.chat.completions.create({
    model: MODEL_LARGE,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `Resume estos correos de forma concisa y cercana. Agrupa los similares.
PROHIBIDO Markdown. Usa solo HTML si necesitas formato.`
      },
      { role: "user", content: emailList }
    ]
  });

  await trackUsage(
    userId,
    MODEL_LARGE,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "summarize_emails"
  );

  return response.choices[0]?.message.content ?? "No he podido resumir los correos.";
}

export async function inferProfile(
  userId: number,
  message: string,
  soul: Record<string, any>,
  profile: Record<string, any>
): Promise<{ soul?: Record<string, any>; profile?: Record<string, any> }> {
  const confirmed = {
    soul: soul._confirmed ?? [],
    profile: profile._confirmed ?? [],
  };

  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Analiza si el usuario está pidiendo EXPLÍCITAMENTE cambiar algún dato de su perfil o del asistente.
Solo actualiza si hay una intención clara y directa como "llámame X", "vivo en Y", "cambia mi horario a Z".
Si el usuario simplemente menciona algo sin intención de cambio, devuelve campos vacíos.
Campos bloqueados que NUNCA puedes actualizar: soul=${JSON.stringify(confirmed.soul)}, profile=${JSON.stringify(confirmed.profile)}
Soul actual: ${JSON.stringify(soul)}
Perfil actual: ${JSON.stringify(profile)}
Responde SOLO en JSON: {"soul":{},"profile":{}}`
      },
      { role: "user", content: message }
    ]
  });

  await trackUsage(
    userId,
    MODEL_SMALL,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "infer_profile"
  );

  try {
    return JSON.parse(response.choices[0]?.message.content ?? "{}");
  } catch {
    return {};
  }
}

export async function interpretIntent(
  userId: number,
  message: string,
  options: string[]
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Clasifica este mensaje en una de estas opciones: ${options.join(", ")}.
Responde SOLO en JSON: {"intent":"opcion"}`
      },
      { role: "user", content: message }
    ]
  });

  await trackUsage(
    userId,
    MODEL_SMALL,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "interpret_intent"
  );

  try {
    const result = JSON.parse(response.choices[0]?.message.content ?? "{}");
    return result.intent ?? options[0];
  } catch {
    return options[0]!;
  }
}

export async function normalizeTimezone(
  userId: number,
  input: string
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Convierte esta ubicación o zona horaria al formato IANA (ej: Europe/Madrid, America/New_York).
Responde SOLO en JSON: {"tz":"zona_iana"}`
      },
      { role: "user", content: input }
    ]
  });

  await trackUsage(
    userId,
    MODEL_SMALL,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    "normalize_tz"
  );

  try {
    const result = JSON.parse(response.choices[0]?.message.content ?? "{}");
    return result.tz ?? "Europe/Madrid";
  } catch {
    return "Europe/Madrid";
  }
}