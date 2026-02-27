import type { Context } from "telegraf";
import { AIService } from "@/services/ai.service";
import { DBService } from "@/services/db.service";

export class MessageHandler {
  static async handleIncomingText(ctx: Context) {
    if (!("text" in ctx.message!)) return;

    const userMessage = ctx.message.text;
    const chatId = ctx.chat!.id;
    const user = ctx.from!;

    console.log(`💬 Mensaje recibido de ${user.first_name} (${chatId}): "${userMessage}"`);

    try {
      await ctx.sendChatAction("typing");

      // 1. Registrar/actualizar usuario
      await DBService.upsertUser(user.id, user.username, user.first_name);

      // 2. Guardar mensaje del usuario
      await DBService.saveMessage(chatId, "user", userMessage);

      // 3. Obtener historial (últimos 10 mensajes)
      const history = await DBService.getChatHistory(chatId, 10);

      // 4. Pedirle a Groq que analice con contexto de historial
      const response = await AIService.analyzeMessage(userMessage, history);

      // 5. Guardar respuesta del asistente
      await DBService.saveMessage(chatId, "assistant", response);

      // 6. Responder al usuario
      await ctx.reply(response);
    } catch (error) {
      console.error("❌ Error en MessageHandler:", error);
      await ctx.reply("He tenido un problema al procesar tu mensaje. Inténtalo de nuevo en un momento.");
    }
  }
}