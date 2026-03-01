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
  - `google_token`: JSON con credenciales de Google.
  - `current_draft`: Memoria del borrador activo (JSON) para persistencia entre turnos.
- **Tabla `pending_drafts`**: Almacena borradores temporales para evitar límites de Telegram (callback data).
- **Callbacks**:
  - `https://bridge-dashboard-six.vercel.app/api/auth/callback/google`
  - `https://bridge-dashboard-six.vercel.app/api/auth/callback/notion`

## Capacidades de Gmail (v0.1.0)

### 1. Lectura y Búsqueda Inteligente

- **Tiered Search**: Primero busca en "Principal" y, si no hay resultados, hace un fallback silencioso a una búsqueda global (incluyendo Spam/Promociones).
- **Resúmenes**: Utiliza IA para resumir hilos de correo.
- **Botones Dinámicos**: Enlaces directos a los correos en la web de Gmail.

### 2. Redacción y Envío (Secretarial Logic)

- **Drafting**: Redacción proactiva basada en lenguaje natural.
- **Búsqueda de Contactos**: Integración con Google People API para encontrar emails por nombre.
- **Memoria de Secretaria**: Si el usuario proporciona un email manualmente tras una búsqueda fallida, Bridge lo asocia al borrador guardado en DB sin perder el hilo.
- **Threading**: Capacidad de responder a hilos manteniendo `In-Reply-To` y `References`.
- **Detección de No-Reply**: Aviso automático si el destinatario es una dirección de "no-reply".

### 3. Sistema de Persistencia de Borradores (Fixes Críticos)

- **Bypass de Telegram (64B)**: Los botones de confirmación ya no llevan el texto del correo; llevan un ID corto que apunta a `pending_drafts` en Turso.
- **Formato MIME Estándar**: Implementación de saltos de línea CRLF (`\r\n`) para evitar errores de `Invalid To header`.

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

## Estado del Proyecto (v0.1.0)

- [x] Bot conectado a Telegram y Groq.
- [x] Base de datos Turso configurada y migrada.
- [x] Dashboard en AstroJS desplegado en Vercel.
- [x] Lógica de callbacks de OAuth implementada.
- [x] Comando `/conectar` con botón interactivo.
- [x] Integración real con Gmail (Leer, Buscar, Resumir, Borrar).
- [x] Sistema de Envío y Respuesta con persistencia en DB.
- [x] Fix crítico de límites de callback data de Telegram.
- [ ] Integración con Notion (Crear tareas/notas).

## Guía de Desarrollo Local

1. **Bot**: `bun start` (Vigilante de correos + Servidor Webhook).
2. **Dashboard**: `cd dashboard && bun dev` (puerto 4321).
