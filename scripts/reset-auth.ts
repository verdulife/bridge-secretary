import { DBService } from "../src/services/db.service";

// Obtener el chatId de los argumentos o usar uno por defecto para pruebas
const chatId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!chatId) {
  console.log("❌ Debes proporcionar un chatId: bun scripts/reset-auth.ts <chatId>");
  process.exit(1);
}

console.log(`🧹 Reseteando tokens de Google para el usuario ${chatId}...`);

try {
  await DBService.clearGoogleTokens(chatId);
  console.log("✅ Tokens borrados. Ya puedes volver a vincular tu cuenta desde el dashboard.");
} catch (error) {
  console.error("❌ Error al resetear:", error);
}
