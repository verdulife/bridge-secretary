# Bridge — Documento de Contexto

## 1. Qué es Bridge

Bridge es un asistente personal proactivo que vive en Telegram. Su misión es ayudar al usuario a tener el control de su email, tareas y agenda sin esfuerzo. No es un chatbot generalista, es un organizador proactivo que anticipa necesidades y actúa con confirmación del usuario.

**Principios core:**
- Nunca filtra, siempre informa. Prioriza, no censura
- Todas las acciones sobre datos del usuario requieren confirmación explícita
- Optimización de tokens en cada decisión de arquitectura
- Experiencia nativa en Telegram, sin fricciones

---

## 2. Stack Técnico

- **Runtime**: Bun
- **Bot**: Telegraf
- **DB**: Turso (SQLite en la nube)
- **IA**: Groq (Llama 3.3 70B y Llama 3.1 8B)
- **Tunnel desarrollo**: ngrok (dominio estático gratuito)
- **Admin dashboard**: Astro + Svelte + Tailwind + shadcn-svelte (tema zinc)
- **Panel usuario (Mini Web App)**: Vite + Svelte + Tailwind
- **Google APIs**: googleapis SDK

---

## 3. Estructura del Proyecto
```
bridge/
  src/
    index.ts              — punto de entrada, llama startServer() y startWorker()
    bot.ts                — instancia Telegraf, registra handlers
    server.ts             — Bun.serve puerto 8520, enruta /webhook /api /panel-app
    worker.ts             — ciclo cada 5 min: alertas + Gmail
    handlers/
      messages.ts         — lógica principal de mensajes y onboarding
      commands.ts         — /acceso, /soporte
      callbacks.ts        — botones inline (archive, delete, bulk)
      panel.ts            — endpoints /api/panel/*
      auth.ts             — endpoints /api/auth/gmail/*
    services/
      db.ts               — todas las funciones de Turso
      ai.ts               — todas las llamadas a Groq
      google.ts           — OAuth y Gmail API
      notify.ts           — envío de alertas pendientes desde queue
    middleware/
      telegram.ts         — verificación HMAC-SHA256 de initData
    prompts/
      base.ts             — BASE_PROMPT del asistente
  scripts/
    dev.ts                — ngrok tunnels + webhook + Vite
  admin/                  — dashboard admin (Astro)
  user/                   — Panel Mini Web App (Vite + Svelte)
```

---

## 4. Base de Datos (Turso)

### `users`
```sql
id INTEGER PRIMARY KEY        -- userId de Telegram
username TEXT
first_name TEXT
status TEXT DEFAULT 'unknown' -- unknown|waitlist|beta|active|blocked
google_token TEXT             -- JSON {access_token, refresh_token, expiry_date}
user_profile TEXT             -- JSON (ver sección 5)
current_context TEXT          -- JSON (ver sección 5)
soul TEXT                     -- JSON (ver sección 5)
created_at DATETIME
```

### `conversations`
```sql
user_id INTEGER PRIMARY KEY
messages TEXT DEFAULT '[]'    -- JSON array, máx 20 mensajes
updated_at DATETIME
```

### `usage`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER
model TEXT
input_tokens INTEGER
output_tokens INTEGER
task TEXT                     -- chat|classify_email|summarize_emails|infer_profile|interpret_intent|normalize_tz|normalize_hl|extract_search_query
created_at DATETIME
```

### `queue`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER               -- null para tareas internas globales
type TEXT                     -- 'alert' | 'internal'
status TEXT DEFAULT 'pending' -- pending|sent|confirmed|rejected|done|failed
scheduled_at DATETIME         -- null = inmediato
payload TEXT                  -- JSON con message y datos del contexto
action TEXT                   -- JSON con acción a ejecutar si usuario confirma. null si no hay acción
created_at DATETIME
updated_at DATETIME
```

**Regla de limpieza**: entradas con status done/rejected/failed se conservan 30 días y luego se limpian con tarea internal del worker.

---

## 5. Los Tres JSONs por Usuario

### `soul` — quién es Bridge para este usuario
```json
{
  "name": "Bridge",
  "tone": null,
  "style": null,
  "_confirmed": ["name"]
}
```
- `_confirmed` indica campos confirmados explícitamente. Ya NO bloquea escritura, solo es informativo
- Todos los campos pueden mutar si hay intención explícita del usuario

### `user_profile` — quién es el usuario
```json
{
  "n": null,
  "tz": "Europe/Madrid",
  "hl": "09:00-18:00",
  "lang": null,
  "response_speed": null,
  "notification_sensitivity": null,
  "_confirmed": ["n", "tz", "hl"]
}
```
- `tz` siempre en formato IANA
- `hl` siempre en formato HH:MM-HH:MM

### `current_context` — estado operativo de la conversación
```json
{
  "onboarding_step": "complete",
  "pending_q": null,
  "last_topic": null,
  "last_active": null,
  "awaiting": null,
  "pending_bulk": null
}
```
- `onboarding_step`: new → name → user_name → tz → hl → complete
- `awaiting`: cuando Bridge espera confirmación del usuario para ejecutar una acción
- `pending_bulk`: lista temporal de IDs de emails para acciones en masa

---

## 6. Arquitectura de IA

### Modelos
- **Llama 3.3 70B** (`llama-3.3-70b-versatile`): conversación, resumen de emails, inferencia de perfil
- **Llama 3.1 8B** (`llama-3.1-8b-instant`): clasificación de emails, interpretación de intención, normalización de datos

### Métodos en `ai.ts`
| Método | Modelo | Propósito |
|--------|--------|-----------|
| `chat()` | 70B | Conversación general |
| `classifyEmail()` | 8B | Clasificar email en attention/pending/informative/spam |
| `summarizeEmails()` | 70B | Resumir lista de emails de forma natural |
| `inferProfile()` | 8B | Detectar cambios explícitos en soul/perfil |
| `interpretIntent()` | 8B | Clasificar intención del usuario en opciones dadas |
| `normalizeTimezone()` | 8B | Convertir texto a formato IANA |
| `normalizeWorkingHours()` | 8B | Convertir texto a formato HH:MM-HH:MM |
| `extractSearchQuery()` | 8B | Extraer query de búsqueda Gmail del mensaje del usuario |
| `isValidIANA()` | — | Validación local de zona horaria, sin llamada a Groq |

### System prompt (capas)
1. BASE_PROMPT — quién es Bridge, capacidades, reglas
2. SOUL — nombre y estilo del asistente
3. USER_PROFILE — datos del usuario
4. CURRENT_CONTEXT — estado de la conversación
5. SYSTEM — datetime actual en zona horaria del usuario

---

## 7. Flujos Implementados

### Onboarding
new → "¿Quieres ponerme un mote?" → name
name → guarda nombre del bot o "Bridge" → "¿Cómo te llamas?" → user_name
user_name → guarda nombre del usuario → "¿En qué país vives?" → tz
tz → normaliza a IANA, valida, reintenta si falla → "¿Tu horario?" → hl
hl → confirm guarda 09:00-18:00 / custom normaliza → complete

### Control de acceso
- `unknown` → mensaje bienvenida, no se crea fila en DB
- `waitlist` → mensaje de espera
- `beta/active` → lógica principal
- `blocked` → mensaje suspensión

### Worker (cada 5 minutos)
1. Para cada usuario activo → `sendPendingAlerts()` (sin Groq)
2. Si tiene google_token → lee emails sin `Bridge/Revisado`
3. Para cada email nuevo → clasifica (8B) → etiqueta en Gmail → encola según categoría
4. `attention/pending` → alerta inmediata o para inicio de jornada
5. `informative/spam` → acumula → resumen para inicio de jornada

### Etiquetas Gmail
- `Bridge/Revisado` — todo email procesado
- `Bridge/Atención` — emails urgentes
- `Bridge/Pendiente` — emails que requieren acción
- `Bridge/Informativo` — emails sin acción requerida
- `Bridge/Spam` — emails descartables

### Gmail conversacional
- `get_emails` → `getUnreadEmails()` → `summarizeEmails()` → resumen sin botones si múltiples remitentes
- `get_single_email` → `extractSearchQuery()` → `searchEmails()` → si 1 email: resumen + botones inline / si varios: resumen + botones en masa

### Botones inline
- Email único: 📬 Abrir (url Gmail) | 📦 Archivar | 🗑️ Eliminar
- Bulk: 📦 Archivar todos | 🗑️ Eliminar todos (IDs en `pending_bulk`)

### Panel (Mini Web App Telegram)
- Vite + Svelte en `/user`, desplegado en Vercel (pendiente)
- Autenticación: HMAC-SHA256 de initData de Telegram
- En desarrollo: ngrok dominio estático `NGROK_DOMAIN`
- Secciones: Perfil | Bridge | Integraciones | Cuenta
- OAuth Google desde sección Integraciones, callback en servidor del bot

### Admin Dashboard
- Astro + Svelte en `/admin`
- Login con ADMIN_PASSWORD
- Tabla de usuarios con botones Activar/Bloquear
- Activar envía mensaje de Telegram al usuario

---

## 8. Estado Actual

### Completado ✅
- Control de acceso completo (waitlist, beta, active, blocked)
- Admin dashboard con gestión de usuarios
- Onboarding completo con normalización de datos
- Sistema de IA con soul, user_profile, current_context
- inferProfile protegido (solo cambios explícitos)
- Tracking de uso por usuario en tabla `usage`
- Worker proactivo con clasificación y etiquetado de Gmail
- Sistema de queue para alertas y tareas
- Notificaciones proactivas via Telegram
- Gmail conversacional (ver emails, buscar, resumen)
- Botones inline para email único (abrir, archivar, eliminar)
- Acciones en masa con botones bulk
- Panel Mini Web App con sección Integraciones y OAuth Google

### En progreso ⚠️
- Bug: emails informativos/spam se duplican en queue porque `labelEmail` no está funcionando correctamente para estos — pendiente de verificar con logs
- Botones en masa: `intentIntent` clasifica "emails de X" como `get_emails` en lugar de `get_single_email`
- Resumen de emails usa Markdown en lugar de texto plano

### Pendiente ❌
- Subfase 2c mejorada: "mover a carpeta"
- Fase 3: gestión de confirmaciones con `awaiting`
- Fase 4: validación de perfil en el worker
- Fase 5: actualizar `base.ts` con capacidades reales de Gmail
- Fase 6: Panel secciones Perfil, Bridge, Cuenta
- Google Calendar
- Notion
- Limpieza automática de queue (entradas antiguas done/failed)
- Despliegue: servidor local + Cloudflare Tunnel + dominio propio

---

## 9. Decisiones Arquitectónicas Importantes

- **Sin MCP**: integraciones directas como módulos en `src/services/` para máximo control de tokens
- **Sin tool calling de Groq**: Llama 3.3 70B tiene bugs con tool_use_failed. Se usa `interpretIntent()` con 8B en su lugar
- **Sin invite keys**: acceso gestionado 100% via admin dashboard
- **Sin tabla separada para soul**: es una columna JSON en `users` como el resto
- **`_confirmed` no bloquea**: solo es informativo, cualquier campo muta con intención explícita
- **Un solo worker**: no procesos separados, `setInterval` dentro del mismo proceso Bun
- **Queue genérica**: tipos `alert` e `internal`, con `action` opcional para confirmaciones
- **Panel en Vercel**: Mini Web App estática, bot en servidor local con Cloudflare Tunnel en producción
- **ngrok dominio estático**: para desarrollo estable sin cambiar BotFather en cada reinicio

---

## 10. Problemas Conocidos

1. **Duplicados en queue**: emails informativos/spam no se están etiquetando con `Bridge/Revisado` correctamente, el worker los reencola en cada ciclo. Pendiente de verificar con logs en `labelEmail`

2. **Resumen con Markdown**: `summarizeEmails` genera respuestas con `*` a pesar de tener prohibido Markdown en el prompt. Hay que reforzar el prompt o añadir un paso de limpieza

3. **`intentIntent` clasificación**: "dame los emails de Ahrefs" se clasifica como `get_emails` en lugar de `get_single_email`. Hay que ajustar las opciones o el prompt de `interpretIntent`

4. **Hora con desfase**: la zona horaria del usuario a veces tiene 1 hora de desfase. Relacionado con cómo se construye `getNextWorkdayStart` en el worker

5. **Panel no desplegado**: actualmente el Panel solo funciona en desarrollo local via ngrok. Pendiente desplegar en Vercel

## 11. Variables de Entorno
```env
# Bot (.env raíz)
TELEGRAM_TOKEN=
GROQ_API_KEY=
TURSO_URL=
TURSO_AUTH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_ID=
ADMIN_PASSWORD=
NODE_ENV=development
BASE_URL=
NGROK_AUTH_TOKEN=
NGROK_DOMAIN=
PORT=8520

# Admin (admin/.env)
ADMIN_PASSWORD=
TELEGRAM_TOKEN=
TURSO_URL=
TURSO_AUTH_TOKEN=

# Panel (user/.env)
VITE_API_URL=http://localhost:8520
```

## 12. Scripts

- `bun run dev` desde raíz → arranca bot + Panel + ngrok tunnels
- `bun run dev` desde `/admin` → arranca dashboard admin
- `bun run build` desde `/user` → compila Panel estático

## 13. Roadmap Futuro

- Google Calendar: leer eventos, detectar fechas en emails, proponer agenda
- Notion: tareas, notas, informes proactivos
- Llamadas via Telegram como alarmas (pendiente investigar MTProto/GramJS)
- Despliegue: servidor local + Cloudflare Tunnel + dominio propio
- Panel: secciones Perfil, Bridge y Cuenta
- Limpieza automática de queue (entradas antiguas done/failed)

## 14. Convenciones de Código

- Sin clases, solo funciones exportadas
- Archivos en `src/services/` sin sufijo `.service` (db.ts, ai.ts, google.ts)
- Variables de entorno: `Bun.env` en el bot, `import.meta.env` en admin, `process.env` en scripts
- CORS headers aplicados en `server.ts`, no en los handlers
- Todos los métodos de IA reciben `userId` como primer parámetro para tracking
- HTML permitido en respuestas de Telegram (`parse_mode: "HTML"`), Markdown prohibido
- Escapar HTML con `escapeHTML()` antes de enviar respuestas al usuario

## 15. Contexto de Desarrollo

- Desarrollador: Verdu, basado en Vilafranca del Penedès, Cataluña
- Máquina de desarrollo: Windows 11
- El proyecto está en la rama `clean` de git
- Bridge está en fase privada beta, actualmente con un solo usuario (el propio Verdu)
- Estilo de trabajo: pasos pequeños e incrementales, debatir arquitectura antes de codificar