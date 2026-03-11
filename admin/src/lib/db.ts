import { createClient } from "@libsql/client";

export const client = createClient({
  url: import.meta.env.TURSO_URL,
  authToken: import.meta.env.TURSO_AUTH_TOKEN,
});