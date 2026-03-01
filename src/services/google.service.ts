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
   * Asegura que las etiquetas de Bridge existen y devuelve sus IDs.
   */
  static async ensureBridgeLabels(userId: number): Promise<{ revisado: string; atencion: string } | null> {
    try {
      const profile = await DBService.getUserProfile(userId);
      if (profile.labels?.revisado && profile.labels?.atencion) {
        return profile.labels;
      }

      const gmail = await this.getGmailClient(userId);
      const res = await gmail.users.labels.list({ userId: "me" });
      const labels = res.data.labels || [];

      let revisadoId = labels.find(l => l.name === "Bridge/Revisado")?.id;
      let atencionId = labels.find(l => l.name === "Bridge/Atención")?.id;

      if (!revisadoId) {
        const revLabel = await gmail.users.labels.create({
          userId: "me",
          requestBody: {
            name: "Bridge/Revisado",
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          }
        });
        revisadoId = revLabel.data.id!;
      }

      if (!atencionId) {
        const ateLabel = await gmail.users.labels.create({
          userId: "me",
          requestBody: {
            name: "Bridge/Atención",
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
            color: { backgroundColor: "#f691b2", textColor: "#ffffff" }
          }
        });
        atencionId = ateLabel.data.id!;
      }

      const newLabels = { revisado: revisadoId, atencion: atencionId };
      await DBService.updateUserProfile(userId, { labels: newLabels });

      return newLabels;
    } catch (error) {
      console.error("❌ Error en ensureBridgeLabels:", error);
      return null;
    }
  }

  /**
   * Aplica una etiqueta a un correo.
   */
  static async labelEmail(userId: number, emailId: string, labelId: string) {
    try {
      const gmail = await this.getGmailClient(userId);
      await gmail.users.messages.modify({
        userId: "me",
        id: emailId,
        requestBody: {
          addLabelIds: [labelId]
        }
      });
      return true;
    } catch (error) {
      console.error(`❌ Error en labelEmail para ${emailId}:`, error);
      return false;
    }
  }

  /**
   * Obtiene correos de la bandeja principal que no tengan la etiqueta de Revisado.
   */
  static async getUnreviewedEmails(userId: number, revisadoLabelId: string): Promise<any[]> {
    try {
      const gmail = await this.getGmailClient(userId);
      // Solo en INBOX y que no tengan la etiqueta revisada de bridge
      const q = `in:inbox category:primary -label:${revisadoLabelId}`;

      const res = await gmail.users.messages.list({
        userId: "me",
        maxResults: 10,
        q,
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) return [];

      const unreviewedOnes = [];
      for (const msg of messages) {
        const details = await gmail.users.messages.get({ userId: "me", id: msg.id! });
        const headers = details.data.payload?.headers;

        // Extraemos si el motor de google lo marca como SPAM o si realmente es inbox (a veces category:primary falla).
        const labelIds = details.data.labelIds || [];

        unreviewedOnes.push({
          id: msg.id,
          subject: headers?.find(h => h.name === "Subject")?.value || "(Sin asunto)",
          from: headers?.find(h => h.name === "From")?.value || "Desconocido",
          snippet: details.data.snippet || "",
          labelIds
        });
      }

      return unreviewedOnes.reverse(); // Del más antiguo al más nuevo de la lista
    } catch (error) {
      console.error("❌ Error en getUnreviewedEmails:", error);
      return [];
    }
  }
}
