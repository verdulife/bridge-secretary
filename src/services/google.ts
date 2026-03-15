import { google } from "googleapis";

const CLIENT_ID = Bun.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = Bun.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = `${Bun.env.BASE_URL}/api/auth/gmail/callback`;

export function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(userId: number): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    state: String(userId),
  });
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date!,
  };
}

export function createGmailClient(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  onRefresh?: (newTokens: typeof tokens) => void
) {
  const client = createOAuthClient();
  client.setCredentials(tokens);

  client.on("tokens", (newTokens) => {
    if (newTokens.access_token && onRefresh) {
      onRefresh({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
        expiry_date: newTokens.expiry_date ?? tokens.expiry_date,
      });
    }
  });

  return google.gmail({ version: "v1", auth: client });
}

export async function getUnreadEmails(tokens: {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}, onRefresh?: (newTokens: typeof tokens) => void): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  const gmail = createGmailClient(tokens, onRefresh);

  const list = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox -in:spam -label:Bridge\\/Revisado",
    maxResults: 20,
  });

  const messages = list.data.messages ?? [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async (msg) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = full.data.payload?.headers ?? [];
      const get = (name: string) => headers.find(h => h.name === name)?.value ?? "";

      return {
        id: msg.id!,
        from: get("From"),
        subject: get("Subject"),
        snippet: full.data.snippet ?? "",
        date: get("Date"),
      };
    })
  );

  return emails;
}

export type EmailCategory = "attention" | "pending" | "informative" | "spam";

export async function labelEmail(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  emailId: string,
  category: EmailCategory,
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<void> {
  const gmail = createGmailClient(tokens, onRefresh);

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labels = labelsRes.data.labels ?? [];

  async function getOrCreateLabel(name: string): Promise<string> {
    const existing = labels.find(l => l.name === name);
    if (existing?.id) return existing.id;
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    return created.data.id!;
  }

  const categoryMap: Record<EmailCategory, string> = {
    attention: "Bridge/Atención",
    pending: "Bridge/Pendiente",
    informative: "Bridge/Informativo",
    spam: "Bridge/Spam",
  };

  const [revisadoId, categoryId] = await Promise.all([
    getOrCreateLabel("Bridge/Revisado"),
    getOrCreateLabel(categoryMap[category]),
  ]);

  await gmail.users.messages.modify({
    userId: "me",
    id: emailId,
    requestBody: {
      addLabelIds: [revisadoId, categoryId],
    },
  });
}

export async function archiveEmail(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  emailId: string,
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<void> {
  const gmail = createGmailClient(tokens, onRefresh);
  await gmail.users.messages.modify({
    userId: "me",
    id: emailId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
}

export async function deleteEmail(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  emailId: string,
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<void> {
  const gmail = createGmailClient(tokens, onRefresh);
  await gmail.users.messages.trash({
    userId: "me",
    id: emailId,
  });
}

export async function searchEmails(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  query: string,
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  const gmail = createGmailClient(tokens, onRefresh);

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 5,
  });

  const messages = list.data.messages ?? [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async (msg) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = full.data.payload?.headers ?? [];
      const get = (name: string) => headers.find(h => h.name === name)?.value ?? "";

      return {
        id: msg.id!,
        from: get("From"),
        subject: get("Subject"),
        snippet: full.data.snippet ?? "",
        date: get("Date"),
      };
    })
  );

  return emails;
}

export async function archiveEmails(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  emailIds: string[],
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<void> {
  const gmail = createGmailClient(tokens, onRefresh);
  await Promise.all(emailIds.map(id =>
    gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["INBOX"] },
    })
  ));
}

export async function deleteEmails(
  tokens: { access_token: string; refresh_token: string; expiry_date: number },
  emailIds: string[],
  onRefresh?: (newTokens: typeof tokens) => void
): Promise<void> {
  const gmail = createGmailClient(tokens, onRefresh);
  await Promise.all(emailIds.map(id =>
    gmail.users.messages.trash({ userId: "me", id })
  ));
}