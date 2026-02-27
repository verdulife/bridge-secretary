import { createClient } from "@libsql/client";

const client = createClient({
  url: Bun.env.TURSO_URL!,
  authToken: Bun.env.TURSO_AUTH_TOKEN!,
});

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class DBService {
  /**
   * Guarda o actualiza un usuario en la base de datos
   */
  static async upsertUser(id: number, username?: string, first_name?: string) {
    try {
      await client.execute({
        sql: `INSERT INTO users (id, username, first_name) 
              VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                username = excluded.username,
                first_name = excluded.first_name`,
        args: [id, username || null, first_name || null],
      });
    } catch (error) {
      console.error("❌ Error en upsertUser:", error);
    }
  }

  /**
   * Guarda un mensaje en el historial
   */
  static async saveMessage(chat_id: number, role: "user" | "assistant", content: string) {
    try {
      await client.execute({
        sql: "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
        args: [chat_id, role, content],
      });
    } catch (error) {
      console.error("❌ Error en saveMessage:", error);
    }
  }

  /**
   * Recupera los últimos N mensajes de un chat
   */
  static async getChatHistory(chat_id: number, limit: number = 10): Promise<Message[]> {
    try {
      const result = await client.execute({
        sql: "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?",
        args: [chat_id, limit],
      });

      return result.rows.map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content as string,
      }));
    } catch (error) {
      console.error("❌ Error en getChatHistory:", error);
      return [];
    }
  }
  /**
   * Guarda los tokens de un servicio para un usuario
   */
  static async updateTokens(id: number, service: "notion" | "google", tokens: any) {
    const column = service === "notion" ? "notion_token" : "google_token";
    try {
      await client.execute({
        sql: `UPDATE users SET ${column} = ? WHERE id = ?`,
        args: [JSON.stringify(tokens), id],
      });
    } catch (error) {
      console.error(`❌ Error en updateTokens (${service}):`, error);
    }
  }

  /**
   * Recupera los tokens de un usuario
   */
  static async getTokens(id: number): Promise<{ notion?: any; google?: any }> {
    try {
      const result = await client.execute({
        sql: "SELECT notion_token, google_token FROM users WHERE id = ?",
        args: [id],
      });

      if (result.rows.length === 0) return {};

      const row = result.rows[0];
      if (!row) return {};

      return {
        notion: row.notion_token ? JSON.parse(row.notion_token as string) : null,
        google: row.google_token ? JSON.parse(row.google_token as string) : null,
      };
    } catch (error) {
      console.error("❌ Error en getTokens:", error);
      return {};
    }
  }
}
