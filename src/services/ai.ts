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

IMPORTANTE: Tienes acceso a la fecha y hora actual del usuario en el campo datetime. Úsala solo si el usuario te la pregunta explícitamente o si es relevante para responder su consulta. No la menciones de forma proactiva.`;
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
): Promise<{ summary: string; category: "attention" | "pending" | "informative" | "spam" }> {
  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Clasifica este email en una de estas categorías:
- attention: urgente, requiere acción inmediata
- pending: requiere acción pero no es urgente
- informative: útil pero sin acción requerida
- spam: descartable, publicidad, irrelevante

Responde SOLO en JSON: {"summary":"resumen en una frase","category":"attention|pending|informative|spam"}`
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
    return { summary: "Nuevo correo recibido.", category: "informative" };
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
        content: `Eres un asistente personal que resume emails de forma natural y conversacional.
Agrupa los emails similares y presenta un resumen breve y amigable como si se lo contaras a un amigo.
Máximo 3-4 líneas en total. No listes todos los detalles, solo lo más relevante.
Ejemplo de tono: "Tienes un par de alertas de Ahrefs sobre tus sitios web y varios emails de Temu con ofertas."
PROHIBIDO usar Markdown o asteriscos. Sin listas ni bullets. Usa solo texto natural.`
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
Solo actualiza si hay una intención clara y directa como "llámame X", "vivo en Y", "cambia mi horario a Z", "quiero llamarte X".
Si el usuario simplemente menciona algo sin intención de cambio, devuelve campos vacíos.
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
        content: `Convierte esta ubicación o zona horaria al formato IANA exacto (ej: Europe/Madrid, America/New_York, America/Mexico_City).
IMPORTANTE: Devuelve SOLO zonas horarias IANA válidas. Nunca devuelvas nombres de países o ciudades sin formato IANA.
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

export function isValidIANA(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function normalizeWorkingHours(
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
        content: `Convierte este horario laboral al formato HH:MM-HH:MM en 24h.
Ejemplos: "de 9 a 6" → "09:00-18:00", "8 a 15" → "08:00-15:00".
Responde SOLO en JSON: {"hl":"HH:MM-HH:MM"}`
      },
      { role: "user", content: input }
    ]
  });

  await trackUsage(userId, MODEL_SMALL, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0, "normalize_hl");

  try {
    const result = JSON.parse(response.choices[0]?.message.content ?? "{}");
    return result.hl ?? "09:00-18:00";
  } catch {
    return "09:00-18:00";
  }
}

export async function extractSearchQuery(
  userId: number,
  message: string
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL_SMALL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extrae una query de búsqueda para Gmail a partir del mensaje del usuario.
Ejemplos: "emails de Ahrefs" → "from:ahrefs", "último email de Temu" → "from:temu", "emails sobre factura" → "subject:factura".
Responde SOLO en JSON: {"query":"gmail_search_query"}`
      },
      { role: "user", content: message }
    ]
  });

  await trackUsage(userId, MODEL_SMALL, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0, "extract_search_query");

  try {
    const result = JSON.parse(response.choices[0]?.message.content ?? "{}");
    return result.query ?? "";
  } catch {
    return "";
  }
}