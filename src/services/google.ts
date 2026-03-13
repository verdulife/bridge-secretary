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