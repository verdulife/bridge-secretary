import { google } from "googleapis";
import { DBService } from "./db.service";

export class GoogleService {
  private static oauth2Client = new google.auth.OAuth2(
    Bun.env.GOOGLE_CLIENT_ID,
    Bun.env.GOOGLE_CLIENT_SECRET,
    // La URL de redirección no es necesaria para llamadas de servicio con tokens persistentes,
    // pero Google la pide en el constructor.
    "https://bridge-dashboard-six.vercel.app/api/auth/callback/google"
  );

  /**
   * Obtiene un cliente de Gmail autenticado para un usuario específico.
   */
  private static async getGmailClient(userId: number) {
    const tokens = await DBService.getTokens(userId);

    if (!tokens.google) {
      throw new Error("Google account not connected");
    }

    this.oauth2Client.setCredentials(tokens.google);

    return google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  /**
   * Traduce los labelIds de Gmail a nombres de carpetas amigables.
   */
  private static getFolderName(labelIds: string[] = []): string {
    if (labelIds.includes("SPAM")) return "Spam";
    if (labelIds.includes("TRASH")) return "Papelera";
    if (labelIds.includes("CATEGORY_PROMOTIONS")) return "Promociones";
    if (labelIds.includes("CATEGORY_SOCIAL")) return "Social";
    if (labelIds.includes("CATEGORY_UPDATES")) return "Actualizaciones";
    if (labelIds.includes("CATEGORY_FORUMS")) return "Foros";
    if (labelIds.includes("INBOX")) return "Bandeja de entrada";

    // Si tiene etiquetas personalizadas, devolvemos la primera que no sea del sistema
    const custom = labelIds.find(l => !l.startsWith("CATEGORY_") && !["INBOX", "UNREAD", "IMPORTANT", "STARRED", "SENT", "DRAFT"].includes(l));
    return custom || "Archivo";
  }

  /**
   * Lista los últimos correos del usuario. Enfocado en Principal por defecto.
   */
  static async listRecentEmails(userId: number, maxResults: number = 5, category: string = "primary") {
    try {
      const gmail = await this.getGmailClient(userId);
      const res = await gmail.users.messages.list({
        userId: "me",
        maxResults,
        q: category ? `category:${category}` : undefined,
      });

      const messages = res.data.messages || [];
      const emailList = [];

      for (const msg of messages) {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });

        const headers = details.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "(Sin asunto)";
        const from = headers.find((h) => h.name === "From")?.value || "Desconocido";
        const snippet = details.data.snippet || "";
        const folder = this.getFolderName(details.data.labelIds || []);

        emailList.push({
          id: msg.id,
          from,
          subject,
          snippet,
          folder,
        });
      }

      return emailList;
    } catch (error) {
      console.error("❌ Error en GoogleService.listRecentEmails:", error);
      throw error;
    }
  }

  /**
   * Busca correos basados en una consulta.
   */
  static async searchEmails(userId: number, query: string, scope: "primary" | "global" = "primary") {
    try {
      const gmail = await this.getGmailClient(userId);
      const q = scope === "primary" ? `label:INBOX category:primary ${query}` : `in:anywhere ${query}`;

      const res = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 5,
      });

      const messages = res.data.messages || [];
      const emailList = [];

      for (const msg of messages) {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });

        const headers = details.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "(Sin asunto)";
        const from = headers.find((h) => h.name === "From")?.value || "Desconocido";
        const folder = this.getFolderName(details.data.labelIds || []);

        emailList.push({
          id: msg.id,
          from,
          subject,
          folder,
        });
      }

      return emailList;
    } catch (error) {
      console.error("❌ Error en GoogleService.searchEmails:", error);
      throw error;
    }
  }

  /**
   * Obtiene correos nuevos después de un ID específico.
   */
  static async getNewEmails(userId: number, lastId: string | null) {
    try {
      const gmail = await this.getGmailClient(userId);
      const q = lastId ? `after:${Math.floor(Date.now() / 1000) - 1800}` : ""; // últimos 30 min

      const res = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        q,
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) return [];

      const newOnes = [];
      for (const msg of messages) {
        if (msg.id === lastId) break;

        const details = await gmail.users.messages.get({ userId: "me", id: msg.id! });
        const headers = details.data.payload?.headers;

        newOnes.push({
          id: msg.id,
          subject: headers?.find(h => h.name === "Subject")?.value || "(Sin asunto)",
          from: headers?.find(h => h.name === "From")?.value || "Desconocido",
          snippet: details.data.snippet || "",
        });
      }

      return newOnes.reverse();
    } catch (error) {
      console.error("❌ Error en getNewEmails:", error);
      return [];
    }
  }

  /**
   * Mueve un correo a la papelera.
   */
  static async deleteEmail(userId: number, emailId: string) {
    try {
      const gmail = await this.getGmailClient(userId);
      await gmail.users.messages.trash({
        userId: "me",
        id: emailId,
      });
      return true;
    } catch (error) {
      console.error("❌ Error en deleteEmail:", error);
      return false;
    }
  }

  /**
   * Busca contactos por nombre usando la People API.
   */
  static async searchContacts(userId: number, query: string) {
    try {
      const tokens = await DBService.getTokens(userId);
      this.oauth2Client.setCredentials(tokens.google);
      const people = google.people({ version: "v1", auth: this.oauth2Client });

      const res = await people.people.searchContacts({
        query,
        readMask: "names,emailAddresses",
      });

      const connections = res.data.results || [];
      return connections.map(c => ({
        name: c.person?.names?.[0]?.displayName || "Sin nombre",
        email: c.person?.emailAddresses?.[0]?.value || null,
      })).filter(c => c.email) as { name: string; email: string }[];
    } catch (error) {
      console.error("❌ Error en searchContacts:", error);
      return [];
    }
  }

  /**
   * Envía un correo nuevo.
   */
  static async sendEmail(userId: number, to: string, subject: string, body: string) {
    try {
      const gmail = await this.getGmailClient(userId);

      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
      const messageParts = [
        `From: me`,
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        body,
      ];
      // MIME requiere CRLF (\r\n) obligatoriamente
      const message = messageParts.join("\r\n");
      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });
      return true;
    } catch (error) {
      console.error("❌ Error en sendEmail:", error);
      return false;
    }
  }

  /**
   * Responde a un correo existente manteniendo el hilo.
   */
  static async replyEmail(userId: number, threadId: string, originalMessageId: string, to: string, subject: string, body: string) {
    try {
      const gmail = await this.getGmailClient(userId);

      const utf8Subject = `=?utf-8?B?${Buffer.from(subject.startsWith("Re:") ? subject : "Re: " + subject).toString("base64")}?=`;
      const messageParts = [
        `From: me`,
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        `In-Reply-To: <${originalMessageId}>`,
        `References: <${originalMessageId}>`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        body,
      ];
      // MIME requiere CRLF (\r\n) obligatoriamente
      const message = messageParts.join("\r\n");
      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
          threadId: threadId,
        },
      });
      return true;
    } catch (error) {
      console.error("❌ Error en replyEmail:", error);
      return false;
    }
  }
}
