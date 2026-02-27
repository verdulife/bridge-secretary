import { createClient } from "@libsql/client";

const url = Bun.env.TURSO_URL;
const authToken = Bun.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("❌ TURSO_URL o TURSO_AUTH_TOKEN no definidos en .env");
  process.exit(1);
}

const client = createClient({
  url,
  authToken,
});

async function migrate() {
  console.log("🔄 Actualizando esquema de Turso para OAuth...");

  try {
    // Añadimos columnas para Notion y Google
    // Usamos TEXT para guardar el JSON de los tokens
    await client.execute(`ALTER TABLE users ADD COLUMN notion_token TEXT`);
    await client.execute(`ALTER TABLE users ADD COLUMN google_token TEXT`);

    console.log("✅ Columnas notion_token y google_token añadidas.");
  } catch (error: any) {
    if (error.message.includes("duplicate column name")) {
      console.log("ℹ️ Las columnas ya existen, saltando migración.");
    } else {
      console.error("❌ Error en la migración:", error);
    }
  } finally {
    client.close();
  }
}

migrate();
