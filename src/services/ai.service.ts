import Groq from "groq-sdk";

// Bun ya lee el GROQ_API_KEY de tu .env automáticamente
const groq = new Groq({
  apiKey: Bun.env.GROQ_API_KEY,
});

export class AIService {
  /**
   * Envía el mensaje del usuario a Groq con el historial previo y devuelve la respuesta.
   */
  static async analyzeMessage(text: string, history: { role: string; content: string }[] = []): Promise<string> {
    try {
      const messages: any[] = [
        {
          role: "system",
          content: `Eres un secretario personal eficiente y breve llamado Bridge. 
          Tu objetivo es ayudar al usuario a organizar su vida. 
          Si el usuario te da una tarea o cita, confírmala amablemente. 
          Responde siempre en el mismo idioma que el usuario.`
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
        temperature: 0.7,
      });

      return chatCompletion.choices[0]?.message.content || "Lo siento, no he podido procesar eso.";
    } catch (error) {
      console.error("❌ Error en AIService:", error);
      return "Ups, mi cerebro ha tenido un pequeño cortocircuito. ¿Puedes repetirlo?";
    }
  }
}