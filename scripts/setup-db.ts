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

async function setup() {
  console.log("🏗️ Configurando tablas en Turso...");

  try {
    // Tabla de usuarios
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Tabla 'users' lista");

    // Tabla de mensajes (historial)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Tabla 'messages' lista");

    console.log("\n✨ Base de datos configurada correctamente.");
  } catch (error) {
    console.error("❌ Error configurando la base de datos:", error);
  } finally {
    client.close();
  }
}

setup();
