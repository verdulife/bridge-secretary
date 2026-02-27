# Bridge — Contexto del Proyecto

## Visión del Producto

**Bridge** es un secretario personal inteligente que vive en Telegram. Transforma mensajes informales en datos estructurados en Notion y Gmail, liberando la carga mental del usuario.

## Arquitectura Actual (Monorepo)

El proyecto se divide en dos grandes bloques sincronizados a través de **Turso DB**:

### 1. Bot Engine (Bun / Telegraf) — `/src`

- **Punto de entrada**: `src/index.ts`
- **Lógica**: Utiliza Groq (Llama 3.3 70B) para analizar mensajes y gestionar la lógica de negocio.
- **Interacción**: Usa Inline Keyboards (botones) para dirigir al usuario al Dashboard.

### 2. Dashboard Interface (AstroJS / Vercel) — `/dashboard`

- **Framework**: Astro 5 (modo SSR) con adaptador de Vercel.
- **Propósito**: Formulario de configuración de usuario e implementación de flujos OAuth para Notion y Gmail.
- **URL Producción**: `https://bridge-dashboard-six.vercel.app`

## Implementación de OAuth & Persistencia

- **Base de Datos**: Turso DB (SQLite en el Edge).
- **Esquema `users`**:
  - `id`: Telegram ChatID (Primary Key).
  - `first_name`: Preferencia de nombre.
  - `notion_token`: JSON con credenciales de Notion.
  - `google_token`: JSON con credenciales de Google (incluye refresh_token).
- **Callbacks**:
  - `https://bridge-dashboard-six.vercel.app/api/auth/callback/google`
  - `https://bridge-dashboard-six.vercel.app/api/auth/callback/notion`

## Variables de Entorno Requeridas (`.env`)

Deben estar replicadas tanto localmente como en el panel de Vercel:

| Variable               | Origen               |
| :--------------------- | :------------------- |
| `TELEGRAM_TOKEN`       | BotFather            |
| `GROQ_API_KEY`         | Groq Cloud           |
| `TURSO_URL`            | Turso Dashboard      |
| `TURSO_AUTH_TOKEN`     | Turso Dashboard      |
| `NOTION_CLIENT_ID`     | Notion Developers    |
| `NOTION_CLIENT_SECRET` | Notion Developers    |
| `GOOGLE_CLIENT_ID`     | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |

## Estado del Proyecto (v0.0.5)

- [x] Bot conectado a Telegram y Groq.
- [x] Base de datos Turso configurada y migrada.
- [x] Dashboard en AstroJS desplegado en Vercel.
- [x] Lógica de callbacks de OAuth implementada.
- [x] Comando `/conectar` con botón interactivo.
- [/] Configuración de Apps en Google/Notion (Pendiente por el usuario).
- [ ] Integración real de servicios (Crear tareas en Notion / Leer Gmail).

## Guía de Desarrollo Local

1. **Bot**: `bun dev` (puerto 8520 + túnel cloudflare).
2. **Dashboard**: `cd dashboard && bun dev` (puerto 4321).
