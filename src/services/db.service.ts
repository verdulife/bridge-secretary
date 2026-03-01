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
  static async getChatHistory(chat_id: number, limit: number = 20): Promise<Message[]> {
    try {
      const result = await client.execute({
        sql: "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
        args: [chat_id, limit],
      });

      return result.rows.reverse().map((row) => ({
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

  /**
   * Actualiza el ID del último correo procesado para un usuario.
   */
  static async updateLastEmailId(id: number, emailId: string) {
    try {
      await client.execute({
        sql: "UPDATE users SET last_email_id = ? WHERE id = ?",
        args: [emailId, id],
      });
    } catch (error) {
      console.error("❌ Error en updateLastEmailId:", error);
    }
  }

  /**
   * Obtiene el ID del último correo procesado para un usuario.
   */
  static async getLastEmailId(id: number): Promise<string | null> {
    try {
      const result = await client.execute({
        sql: "SELECT last_email_id FROM users WHERE id = ?",
        args: [id],
      });
      return (result.rows[0]?.last_email_id as string) || null;
    } catch (error) {
      console.error("❌ Error en getLastEmailId:", error);
      return null;
    }
  }

  /**
   * Obtiene todos los usuarios que tienen vinculado Google.
   */
  static async getUsersWithGoogle(): Promise<{ id: number; google_token: string; last_email_id: string | null }[]> {
    try {
      const result = await client.execute(
        "SELECT id, google_token, last_email_id FROM users WHERE google_token IS NOT NULL"
      );
      return result.rows.map((row) => ({
        id: row.id as number,
        google_token: row.google_token as string,
        last_email_id: row.last_email_id as string || null,
      }));
    } catch (error) {
      console.error("❌ Error en getUsersWithGoogle:", error);
      return [];
    }
  }

  /**
   * Limpia los tokens de Google y el rastreo de correos para forzar un re-link.
   */
  static async clearGoogleTokens(id: number) {
    try {
      await client.execute({
        sql: "UPDATE users SET google_token = NULL, last_email_id = NULL WHERE id = ?",
        args: [id],
      });
    } catch (error) {
      console.error("❌ Error en clearGoogleTokens:", error);
    }
  }

  /**
   * Inicializa las tablas necesarias si no existen.
   */
  static async init() {
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS pending_drafts (
          id TEXT PRIMARY KEY,
          chat_id INTEGER,
          payload TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      try { await client.execute("ALTER TABLE users ADD COLUMN user_profile TEXT"); } catch (e) { /* ignore if already exists */ }
      try { await client.execute("ALTER TABLE users ADD COLUMN current_context TEXT"); } catch (e) { /* ignore if already exists */ }

    } catch (error) {
      console.error("❌ Error inicializando DB:", error);
    }
  }

  // --- MÉTODOS DE PERFIL Y CONTEXTO ---

  static async getUserProfile(id: number): Promise<Record<string, any>> {
    try {
      const result = await client.execute({
        sql: "SELECT user_profile FROM users WHERE id = ?",
        args: [id]
      });
      const profileStr = result.rows[0]?.user_profile as string;
      if (profileStr) return JSON.parse(profileStr);
    } catch (error) {
      console.error("❌ Error en getUserProfile:", error);
    }
    // Return default profile if none exists
    return {
      n: null,
      tz: null,
      hl: "09:00-18:00",
      lang: null,
      tone: null,
      response_speed: null,
      notification_sensitivity: null
    };
  }

  static async updateUserProfile(id: number, fields: Record<string, any>): Promise<void> {
    try {
      const existing = await this.getUserProfile(id);
      const merged = { ...existing, ...fields };
      await client.execute({
        sql: "UPDATE users SET user_profile = ? WHERE id = ?",
        args: [JSON.stringify(merged), id]
      });
    } catch (error) {
      console.error("❌ Error en updateUserProfile:", error);
    }
  }

  static async getCurrentContext(id: number): Promise<Record<string, any>> {
    try {
      const result = await client.execute({
        sql: "SELECT current_context FROM users WHERE id = ?",
        args: [id]
      });
      const contextStr = result.rows[0]?.current_context as string;
      if (contextStr) return JSON.parse(contextStr);
    } catch (error) {
      console.error("❌ Error en getCurrentContext:", error);
    }
    // Return default context if none exists
    return {
      onboarding_step: "new",
      pending_q: null,
      last_topic: null,
      last_active: null,
      awaiting: null
    };
  }

  static async updateCurrentContext(id: number, fields: Record<string, any>): Promise<void> {
    try {
      const existing = await this.getCurrentContext(id);
      const merged = { ...existing, ...fields };
      await client.execute({
        sql: "UPDATE users SET current_context = ? WHERE id = ?",
        args: [JSON.stringify(merged), id]
      });
    } catch (error) {
      console.error("❌ Error en updateCurrentContext:", error);
    }
  }


}

// Inicializar al cargar el servicio
DBService.init();
