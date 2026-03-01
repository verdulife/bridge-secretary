import Groq from "groq-sdk";

// Bun ya lee el GROQ_API_KEY de tu .env automáticamente
const groq = new Groq({
  apiKey: Bun.env.GROQ_API_KEY,
});

export class AIService {
  /**
   * Envía el mensaje del usuario a Groq con el historial previo y devuelve la respuesta estructurada.
   */
  static async analyzeMessage(
    text: string,
    history: { role: string; content: string }[] = [],
    userProfile: Record<string, any> = {},
    currentContext: Record<string, any> = {}
  ): Promise<any> {
    try {
      const messages: any[] = [
        {
          role: "system",
          content: `Eres Bridge, un colega y secretario personal. 
          Habla de forma cercana, como un amigo (tutea). 
          Sé MUY conciso. Respuestas cortas y directas.

          CONTEXTO OPERATIVO Y PERFIL DEL USUARIO:
          - user_profile: ${JSON.stringify(userProfile)}
          - current_context: ${JSON.stringify(currentContext)}
          
          DEBES RESPONDER EN FORMATO JSON:
          {
            "reply": "Tu respuesta corta", // USA HTML PARA FORMATO (ej: <b>texto</b>). PROHIBIDO USAR ASTERISCOS (**) O MARKDOWN.
            "action": "nombre_del_metodo" (OPCIONAL),
            "params": { 
              "count": número,
              "query": "texto",
              "filter": "todo" | "spam" | "importante" | "de: [remitente]",
              "show_links": boolean
            } (OPCIONAL)
          }

          ACCIONES:
          - "list_recent_emails": Ver correos nuevos o un resumen general.
          - "search_emails": Buscar algo específico en los correos.
          - "delete_email": Borrar un correo específico. Requiere "email_id" o "query". ¡NUNCA inventes el "email_id"! Si no lo sabes exactamente, envíalo vacío y usa "query" para buscarlo.`
        },
        ...history,
        {
          role: "user",
          content: text,
        },
      ];

      const chatCompletion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const rawContent = chatCompletion.choices[0]?.message.content || '{"reply": "Ni idea jefe. ¿Repites?"}';
      return JSON.parse(rawContent);
    } catch (error) {
      console.error("❌ Error en AIService.analyzeMessage:", error);
      return { reply: "Oye, se me ha chamuscado un cable. ¿Me lo repites?" };
    }
  }

  /**
   * Toma una lista de correos y genera un resumen natural, evaluando por importancia o filtro.
   */
  static async summarizeEmails(emails: any[], filter: string = "todo"): Promise<string> {
    if (emails.length === 0) return "Nada nuevo por aquí, bandeja limpia.";

    try {
      const emailContext = emails.map((e) =>
        `ID: ${e.id}\nDe: ${e.from}\nAsunto: ${e.subject}\nCarpeta: ${e.folder}\nSnippet: ${e.snippet}\n---`
      ).join("\n");

      const messages: any[] = [
        {
          role: "system",
          content: `Eres Bridge. Resume estos correos para tu colega. 
          TONO: Informal, como un amigo. Tutea. 
          ESTILO: Ultra-conciso.
          
          FILTRO SOLICITADO: "${filter}"
          Instrucciones:
          - Si el filtro es "todo", resume lo importante y agrupa el ruido.
          - Si el filtro es algo específico (ej: "spam", "importante", o un remitente), IGNORA por completo los correos que no encajen.
          - Si no hay nada que encaje con el filtro, di simplemente que no has encontrado nada de eso.
          - MENCIÓN DE CARPETA: Si un correo NO está en la "Bandeja de entrada" (ej: está en Facturas, Spam, etc.), menciónalo brevemente (ej: "He encontrado esto en la carpeta Facturas: ...").
          
          ESTRECHAMENTE PROHIBIDO EL USO DE MARKDOWN (asteriscos **). 
          USA EXCLUSIVAMENTE ETIQUETAS HTML <b> PARA LO CLAVE.`
        },
        {
          role: "user",
          content: `Los correos:\n\n${emailContext}`
        }
      ];

      const chatCompletion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
      });

      return chatCompletion.choices[0]?.message.content || "He leído los correos pero me he quedado en blanco.";
    } catch (error) {
      console.error("❌ Error en AIService.summarizeEmails:", error);
      return "He tenido un lío analizando los correos. ¿Lo intento otra vez?";
    }
  }

  /**
   * Analiza un único correo entrante para una notificación proactiva.
   */
  static async analyzeProactiveEmail(email: any): Promise<{ summary: string; is_spam: boolean; important: boolean }> {
    try {
      const messages: any[] = [
        {
          role: "system",
          content: `Eres Bridge, filtrando el correo de tu colega.
          Analiza este email y dime qué es de forma MUY breve.
          
          RESPONDE SOLO EN JSON:
          {
            "summary": "Resumen en una frase corta y cercana",
            "is_spam": boolean,
            "important": boolean
          }`
        },
        {
          role: "user",
          content: `De: ${email.from}\nAsunto: ${email.subject}\nSnippet: ${email.snippet}`
        }
      ];

      const chatCompletion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const content = JSON.parse(chatCompletion.choices[0]?.message.content || "{}");
      return {
        summary: content.summary || "Te ha llegado un correo.",
        is_spam: !!content.is_spam,
        important: !!content.important
      };
    } catch (error) {
      console.error("❌ Error en analyzeProactiveEmail:", error);
      return { summary: "Nuevo correo recibido.", is_spam: false, important: false };
    }
  }
}