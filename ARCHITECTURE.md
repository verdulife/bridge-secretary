# Bridge — Arquitectura v1

## Principios de diseño

Bridge es un secretario personal proactivo que vive en Telegram. Su filosofía central es:
- **No invasivo**: agrupa y prioriza, nunca interrumpe sin motivo.
- **No censura**: ningún email desaparece sin que el usuario lo sepa.
- **Orgánico**: la configuración ocurre en la conversación, no en formularios.
- **v1 es solo lectura**: Bridge lee, clasifica, etiqueta y notifica. No redacta ni envía emails.

---

## Stack

- **Bot**: Bun / Telegraf
- **IA**: Groq (Llama 3.3 70B) — mantener a coste 0
- **DB**: Turso (SQLite edge)
- **Dashboard**: AstroJS / Vercel — solo para OAuth, actúa como espejo pasivo

---

## Estructura de datos del usuario

### Regla de escritura (crítica, sin excepciones)
- `user_profile` y `current_context` → solo los escribe el **handler de mensajes**
- El worker → solo escribe campos primitivos propios (`last_email_id`, `last_active`)
- Nunca se pisan entre sí para evitar race conditions

### `user_profile` (JSON en Turso)
Quién es el usuario. Se actualiza con interacción y con inferencias progresivas.

```json
{
  "n": "Marc",
  "tz": "Europe/Madrid",
  "hl": "09:00-18:00",
  "lang": "es",
  "tone": "informal",
  "response_speed": "fast",
  "notification_sensitivity": "medium"
}
```

| Campo | Origen | Descripción |
|---|---|---|
| `n` | onboarding Telegram | Nombre preferido |
| `tz` | onboarding Telegram (bloqueante) | Zona horaria |
| `hl` | onboarding Telegram (default: 09-18) | Horario laboral |
| `lang` | inferido del primer mensaje | Idioma |
| `tone` | inferido con el tiempo | Tono detectado en conversación |
| `response_speed` | inferido con el tiempo | Velocidad de respuesta habitual |
| `notification_sensitivity` | inferido con el tiempo | Si actúa o ignora las alertas |

### `current_context` (JSON en Turso)
Estado operativo de la relación Bridge-usuario. Se actualiza en cada interacción.

```json
{
  "onboarding_step": "complete",
  "pending_q": { "field": "tz", "asked_at": "2025-03-01T10:00Z" },
  "last_topic": "emails_dentista",
  "last_active": "2025-03-01T10:00Z",
  "awaiting": null
}
```

| Campo | Origen | Descripción |
|---|---|---|
| `onboarding_step` | sistema | Fase del onboarding actual |
| `pending_q` | sistema | Pregunta pendiente de respuesta con timestamp |
| `last_topic` | handler mensajes | Último tema tratado |
| `last_active` | handler mensajes | Última interacción |
| `awaiting` | handler mensajes | Si Bridge espera confirmación de algo |

### Campos primitivos del worker (columnas directas en tabla `users`)
- `last_email_id` — último email procesado
- `last_active` — última vez que el worker actuó

---

## Historial de conversación

- Límite: **20 mensajes O 3000 tokens**, lo que se alcance primero
- No hay corte por tiempo: el usuario puede retomar conversaciones anteriores de forma natural
- El historial se pasa completo a Groq en cada request del handler de mensajes

---

## Dos carriles independientes (sin solapamiento)

### Carril conversacional
Lo que el usuario inicia. Tiene su historial de sesión y su `current_context` activo.

### Carril proactivo (worker)
Lo que Bridge inicia: notificaciones, resúmenes, alertas. Nunca mezcla con la conversación activa.

**Regla**: si hay conversación activa en curso, el worker encola las notificaciones. Las entrega cuando el carril conversacional queda libre.

---

## Lógica de notificaciones proactivas

### Clasificación de emails entrantes
1. **Importante** → notificación inmediata, uno a uno, con botón de acción directo
2. **No urgente** → se acumula en resumen agrupado
3. **Spam evidente** → resumen separado, frecuencia baja o bajo demanda

### Timing de resúmenes
Basado en `user_profile.hl` y `user_profile.tz`:
- Resumen de mañana: al inicio del horario laboral con lo acumulado
- Resumen de tarde: al final del horario laboral con lo del día
- Fuera de horario: se encola, no se envía

### La regla de oro
> Bridge nunca filtra, siempre informa. Prioriza, no censura.

---

## Sistema de etiquetas en Gmail

Bridge gestiona dos etiquetas propias en la cuenta Gmail del usuario:
- `Bridge/Revisado` — email ya procesado por el worker
- `Bridge/Atención` — email que requiere acción del usuario

El worker filtra `NOT label:Bridge/Revisado` en cada ciclo. Esto reemplaza el sistema de `last_email_id` y elimina el bug de pérdida silenciosa de emails.

---

## Onboarding por Telegram

El dashboard solo gestiona OAuth (Google, Notion). Todo lo demás ocurre en Telegram de forma orgánica y contextual.

### Preguntas bloqueantes (Bridge no actúa sin este dato)
- Zona horaria (`tz`) — preguntada antes de la primera notificación proactiva
- Vinculaciones OAuth — gestionadas en el dashboard

### Preguntas no bloqueantes (Bridge usa defaults y pregunta en paralelo)
- Horario laboral (`hl`) — default: 09:00-18:00
- Nombre preferido (`n`) — default: first_name de Telegram

### Máquina de estados del perfil
Cada dato tiene tres estados: `unknown` → `pending` → `confirmed`

Cuando un campo está en `pending`, se guarda en `current_context.pending_q` con timestamp. El worker verifica antes de cada ciclo si hay preguntas `pending` sin respuesta de más de 24h y las reintroduce de forma natural en la próxima interacción.

### Tono de las preguntas
Natural y explicativo. Ejemplo:
> "Para no molestarte a deshora, ¿en qué país o región vives? Así sé cuándo es buen momento para avisarte."

---

## Lo que Bridge NO hace en v1
- No redacta emails
- No envía emails
- No responde a hilos
- No gestiona Notion (fase 3)
- No gestiona Google Calendar (fase 2)

---

## Roadmap

- **Fase 1** (actual): Gmail — leer, clasificar, etiquetar, notificar, onboarding por Telegram
- **Fase 2**: Google Calendar — leer eventos, detectar fechas en emails, proponer agenda
- **Fase 3**: Notion — tareas, notas, informes proactivos
