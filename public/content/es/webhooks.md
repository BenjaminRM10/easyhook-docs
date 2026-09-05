# Easyhook Webhooks

Última actualización: 2026-08-28

Easyhook envía un objeto JSON compacto por evento. El formato es compartido por
WhatsApp, Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP email,
Mercado Libre, TikTok Business Messaging, SMS/MMS y llamadas de voz.

Los eventos de ciclo de vida de Telecom utilizan `number.*`, incluido `number.renewal_due`,
`number.renewed`, `number.grace` y `number.released`. Suscríbete con el proveedor
`sms`, `voice` o `*` según proceda.

Proveedor de suscripción a Telecom `sms` o `voice`. Los selectores compatibles incluyen
`message.*` y `call.*`; los acontecimientos concretos en la actualidad incluyen `message.received`,
`message.status`, `call.initiated`, `call.answered`, `call.hangup`, y
`call.transfer_started`.

## Principios

- `id` es el único Easyhook UUID expuesto. Úsalo para deduplicar eventos.
- `channel` Identifica al proveedor: `whatsapp`, `messenger`, `instagram`,
  `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`,
  o `voice`.
- Cuenta, contacto y identificadores de mensajes vienen de Meta, no de la base de datos de Easyhook.
- Para Telefonía, `account.id` es siempre el número de negocio adquirido para ambos
  eventos de entrada y salida. SMS/MMS uso `channel: "sms"`; llamar ciclo de vida
  uso de eventos `channel: "voice"`. La modalidad nunca cambia la conexión
  Identidad.
- Los bloques que no se aplican son omitidos. Easyhook no envía titular `null` campos.
- Los detalles específicos del proveedor utilizados para depurar permanecen en el `X-Easyhook-Provider-Event` Cabeza.
- Las cargas de pago Raw Meta siguen siendo internas y no se envían.

### Telefonía

```json
{
  "id": "event_uuid",
  "type": "call.initiated",
  "channel": "voice",
  "account": { "id": "+13125550100" },
  "contact": { "id": "+13125550999", "phone": "+13125550999" },
  "call": {
    "id": "call_uuid",
    "direction": "inbound",
    "from": "+13125550999",
    "to": "+13125550100",
    "status": "ringing",
    "occurred_at": "2026-08-26T20:00:00.000Z"
  }
}
```

Tipos de llamada `call.initiated`, `call.answered`, `call.ended`, y
`call.cost_updated`. SMS/MMS reutilizar lo normal `message.*` bloque y el mismo
Número de negocio en `account.id`.

## Mensaje de texto

```json
{
  "id": "7ef9509d-8dc2-43d5-9887-1eb7abe3a12e",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100004",
    "name": "webgeoapm"
  },
  "message": {
    "id": "wamid.HBg...",
    "type": "text",
    "text": "como estas",
    "timestamp": "2026-07-10T23:03:40.000Z"
  }
}
```

El mismo evento de Messenger o Instagram solo cambia `channel` y los ID del proveedor:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841400000000001" },
  "contact": { "id": "IGSID_VALUE", "name": "Customer" },
  "message": {
    "id": "mid...",
    "type": "text",
    "text": "hello",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

TikTok utiliza el mismo sobre normalizado. `account.id` es el conectado
Business Account open ID, `contact.id` es el identificador de usuario estable TikTok,
y `message.thread_id` es el identificador de conversación requerido por TikTok.
Los tres valores y los ID de mensaje son opacos y no deben ser reformados.
Easyhook acepta o `contact.id` o `message.thread_id` como tal `to` para una
conversación TikTok existente. Una respuesta de TikTok-buttón
selección utiliza el mismo `message.quick_reply` bloque como otro soporte
canales. Las restricciones de privacidad de los proveedores se emiten como un evento no mensaje
en lugar de fabricar datos de mensajes no disponibles.

Los proveedores de correo electrónico utilizan el mismo evento con campos específicos de correo electrónico:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "outlook",
  "account": { "id": "support@example.com", "name": "Support" },
  "contact": { "id": "customer@example.net", "name": "Customer" },
  "message": {
    "id": "provider-message-id",
    "type": "text",
    "text": "I need help",
    "subject": "Order 1048",
    "html": "<p>I need <strong>help</strong></p>",
    "thread_id": "provider-thread-id",
    "message_id_header": "<message@example.net>",
    "is_read": false,
    "inference_classification": "focused",
    "attachments": [{
      "media_asset_id": "asset_uuid",
      "filename": "invoice.pdf",
      "content_type": "application/pdf",
      "size": 48210
    }],
    "timestamp": "2026-07-27T16:37:02.000Z"
  }
}
```

`channel` puede ser `gmail` o `imap_smtp`. Tratamiento `message.html` como tal
entrada sin confianza y renderizarlo sólo después de la sanitización o dentro de una caja de arena.

Las preguntas de Mercado Libre y los mensajes postventa utilizan el mismo sobre:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "mercadolibre",
  "account": { "id": "123456789", "name": "EASYHOOK_STORE" },
  "contact": { "id": "question:987654321", "name": "Comprador 456789" },
  "message": {
    "id": "question:987654321",
    "direction": "in",
    "type": "text",
    "text": "¿Todavía está disponible?",
    "from": "question:987654321",
    "to": "123456789",
    "timestamp": "2026-07-28T04:00:00.000Z"
  }
}
```

Uso `contact.id` o `message.from` como tal `to` cuando responde. Preguntas de producto
Llegar `question:<id>` y conversaciones postventa como `pack:<id>`.

## Public Subscription API

La clave de API determina la organización. Nunca enviar `tenant_id`.

Los alcances de WhatsApp siguen la misma jerarquía de tres niveles que se muestra en el portal Easyhook y n8n:

1. **Organización**: cada WABA conectado y número propiedad de la clave API.
2. **WABA**: cada número dentro de una cuenta de negocio de WhatsApp.
3. **Phone**: un número específico de remitente WhatsApp.

Meta Business Portfolios se mantienen internamente como metadatos a bordo. No son un alcance público Easyhook y nunca se requieren en las llamadas API de clientes. La identidad WABA se basa en Meta's `waba_id`, no su nombre de exhibición.

| Método | Punto final | Propósito |
| --- | --- | --- |
| `GET` | `/v1/webhooks` | Suscripciones de listas. |
| `GET` | `/v1/webhooks/options` | Lista eventos, alcances y cuentas conectadas compatibles para el organización de API-key. |
| `POST` | `/v1/webhooks` | Crear una suscripción y devolver su secreto una vez. |
| `GET` | `/v1/webhooks/{id}` | Lee una suscripción. |
| `PATCH` | `/v1/webhooks/{id}` | Reemplazar los eventos suscritos sin cambiar la URL, el secreto, la autenticación, el proveedor o el alcance. |
| `DELETE` | `/v1/webhooks/{id}` | Eliminar una suscripción. |
| `POST` | `/v1/webhooks/{id}/replay` | Requisa las entregas fallidas/muertos para esta suscripción. |
| `POST` | `/v1/webhooks/{id}/history-replays` | Reenviar los mensajes de Historia almacenados o los contactos de App State. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | Lea el progreso de repetición persistente. |

Crear una suscripción en toda la organización:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "auth_type": "hmac",
    "scope": { "type": "organization" }
  }'
```

Campos de creación:

| Campo | Necesidad | Significado |
| --- | --- | --- |
| `name` | Sí. | Nombre de suscripción legible por humanos. |
| `url` | Sí. | Destino HTTPS público. HTTP y URL inválidas son rechazadas. |
| `providers` | Sí. | Uno o más proveedores: `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`, `voice`, `*`. Seleccione `*` Las llamadas usan `voice` aquí incluso cuando `data.provider` es `whatsapp`. |
| `events` | Sí. | Uno o más filtros compatibles de `/v1/webhooks/options`. Empty es rechazado. Seleccione `*` solo para cada evento. |
| `scope` | no | Objeto público anidado de alcance. Defectos a toda la organización. |
| `auth_type` | no | `hmac` (default), `bearer`, `custom_header`, `none`. |
| `auth_header_name` | sólo para `custom_header` | Nombre de cabecera personalizado seguro. `Authorization`, cabeceras de transporte, y `X-Easyhook-*` están reservados. |

Actualizar sólo los eventos suscritos después de la creación:

```bash
curl -X PATCH https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": ["message.*", "status.*", "consent.updated"]
  }'
```

`events` reemplaza la selección anterior del evento y debe contener por lo menos uno
evento compatible con los proveedores existentes de webhook.
no rotar o devolver el secreto y no recrea la suscripción.

La creación exitosa devuelve HTTP `201`. Guardar `secret` Inmediatamente; lista/get
las llamadas nunca lo devuelven:

```json
{
  "webhook": {
    "id": "webhook_uuid",
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "scope": { "type": "organization", "ref": null },
    "auth": { "type": "hmac", "header_name": null },
    "status": "active"
  },
  "secret": "whsec_..."
}
```

Alcances disponibles:

```json
{ "type": "organization" }
```

```json
{ "type": "phone", "from": "15550100002" }
```

```json
{ "type": "waba", "from": "15550100002" }
```

```json
{ "type": "channel", "from": "instagram_alias" }
```

Para `phone` y `waba`, Easyhook resuelve el alcance interno de la WhatsApp
número. Una suscripción a WABA recibe eventos coincidentes de todos los números actualmente
conectado a ese WABA. `channel`, utilizar el alias público devuelto para un
Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP, o Mercado Libre
canal interno
IDs de alcance y Meta Business Portfolio IDs nunca son necesarios.

Los números de alcance de WhatsApp siguen la misma normalización internacional que el
Mensaje API: E.164 o dígitos solo con un código de llamadas de país, visual común
separadores, México `52`/`521`, y Argentina móvil `54`/`549` son aceptados.
No se infiere únicamente a números nacionales.

Descubre opciones válidas sin identificadores de codificación:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

`provider` acepta `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`, `voice`, `*`.
`scope_type` acepta `organization`, `waba`,
`phone`, `channel`. Los filtros de respuesta incompatibles combinaciones y
Devoluciones `providers`, `events`, `scope_types`, y `scope_identifiers`.
Los valores de cuenta conectada son números públicos o alias que se pueden enviar como
`scope.from`.

Repetir hasta 100 entregas fallidas. `sync_id` para reproducir las entregas fallidas más antiguas para el gancho:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "sync_id": "SYNC_ID", "limit": 100 }'
```

Replay nunca crea un nuevo evento lógico. Se restablece los intentos de entrega y mantiene la clave original de la idempotencia.

## Filtros

Proveedores:

- `whatsapp`
- `messenger`
- `instagram`
- `telegram`
- `gmail`
- `outlook`
- `imap_smtp`
- `mercadolibre`
- `tiktok`
- `*`

Filtros comunes para eventos:

| Filtro | Recibimientos |
| --- | --- |
| `*` | Cada evento en el proveedor y alcance seleccionados. |
| `message.*` | Mensajes/reacciones entrantes en vivo. No incluye ecos de WhatsApp Business App o importaciones de historia. |
| `message.text`, `message.image`, `message.audio`, `message.video` | Un tipo de mensaje en vivo concreto. |
| `message.document` | Eventos de documentos WhatsApp. |
| `message.reaction` | WhatsApp, Messenger o Instagram reacciona cuando el proveedor los emite. |
| `message.edit` | WhatsApp, Messenger o Instagram edita cuando el proveedor los emite. |
| `message.button`, `message.interactive` | WhatsApp template-button, rapid-reply, list y Flow interactions. |
| `message.quick_reply` | Las selecciones de botones de respuesta se normalizaron a través de WhatsApp, Messenger, Instagram y Telegram. |
| `message.file` | Eventos de archivos Messenger/Instagram. |
| `status.*` | WhatsApp entrega, lee y estado de fracaso. |
| `status.failed` | Sólo fallaron los estados de mensajes de WhatsApp. |
| `scheduled.*` | Creación de mensajes programados, aceptación exitosa del proveedor, fallo de ejecución terminal y cancelación. |
| `template.*` | Actualizaciones de plantilla de WhatsApp. |
| `flow.submission.*` | WhatsApp Flow responde. |
| `smb_message_echo.*` | Mensajes/reacciones enviados desde la App Business de WhatsApp en coexistencia. |
| `smb_app_state_sync.*` | Actualizaciones de contacto/app de coexistencia. |
| `user_preferences.*` | Qué cambia la preferencia de marketing de WhatsApp. |
| `history.*` | Sincronización de historia de la coexistencia. |
| `account_update.*` | Actualizaciones de conexión de cuenta WhatsApp. |
| `onboarding.*` | Alojado en el ciclo de vida. |
| `consent.updated` | El estado de consentimiento de servicio o marketing de un contacto cambió. |
| `contact.updated` | Los metadatos de contacto Easyhook-local WhatsApp cambiaron a través de la API pública. |

Los proveedores de correo electrónico usan el mismo `message.*` suscripción como los otros canales.
Su normalización `message` bloque añade `subject`, opcional `html`, `thread_id`,
`message_id_header`, `in_reply_to`, y `references`. Uso `message.id` como tal
`reply_to_message_id` cuando se responde a través de `POST /v1/messages/email`Render
`html` como contenido no confiable y utilizar los valores de rosca/cabeza cuando sea necesario.

Filtrar utiliza el nombre del evento del proveedor. `type` restos mortales
estandarizado. Uso `smb_message_echo.*` para mensajes enviados desde el WhatsApp
Aplicación de negocios. Uso `message.*` sólo para mensajes entrantes. Uso `history.*`
por separado para conversaciones importadas, estas familias nunca se superponen.

## Tipos de evento

| Público `type` | Bloque principal |
| --- | --- |
| `message.received` | `message` |
| `message.echo` | `message` |
| `message.media_available` | `message`; actualizar el mensaje existente con el mismo `message.id` |
| `message.edit` / normalizado `message.received` | `message.edit.original_message_id`; actualizar el mensaje original en lugar de insertar otro |
| `message.revoke` / normalizado `message.received` | `message.revoke.original_message_id`; marque el mensaje original como eliminado |
| `message.system` / normalizado `message.received` | `message.system`; evento de WhatsApp informativo como un número de teléfono cambiado |
| `message.sent` | `status` |
| `message.delivered` | `status` |
| `message.read` | `status` |
| `message.failed` | `status` |
| `message.status_updated` | `status` para un futuro/no conocido estado de proveedor |
| `scheduled.created` | `scheduled_message` |
| `scheduled.sent` | `scheduled_message`; Easyhook recibió un WAMID de Meta |
| `scheduled.failed` | `scheduled_message`; Fallo de ejecución terminal |
| `scheduled.cancelled` | `scheduled_message` |
| `flow.submitted` | `flow` |
| `template.status_changed` | `template` |
| `template.quality_changed` | `template` |
| `template.category_changed` | `template` |
| `template.components_changed` | `template` |
| `account.updated` | `account_update` |
| `contact.updated` | `contact_update` |
| `user.preference_updated` | `user_preference` |
| `consent.updated` | `consent` |
| `onboarding.created` | `onboarding` |
| `onboarding.completed` | `onboarding` |
| `sync.failed` | `sync` para fracasos del ciclo de vida, o `error` para un error terminal item/provider |
| `sync.started` | `sync` |
| `sync.progress` | `sync` |
| `sync.completed` | `sync` |
| `event.received` | Retrocedimiento dependiente del proveedor; ignorar con seguridad si no está soportado |

Los eventos de proveedores futuros desconocidos se entregan como `event.received`Consumidores
debe ignorar bloques de nivel superior desconocido y valores de enum desconocidos en lugar de
rechazando toda la solicitud.

## Contrato JSON completo

Cada entrega no-batch tiene esta forma lógica.
campos son omitidos; no son enviados como `null`.

```json
{
  "id": "easyhook_event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {},
  "contact": {},
  "message": {},
  "status": {},
  "template": {},
  "flow": {},
  "onboarding": {},
  "scheduled_message": {},
  "sync": {},
  "account_update": {},
  "contact_update": {},
  "error": {}
}
```

Sólo `id`, `type`, y `channel` los bloques restantes dependen de
`type`.

### Correlación de mensajes programados

Suscríbete `scheduled.*` junto con `status.*` cuando una aplicación programa mensajes.

`scheduled.created`, `scheduled.sent`, `scheduled.failed`, y `scheduled.cancelled` porta:

```json
{
  "id": "easyhook_event_uuid",
  "type": "scheduled.sent",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "accepted",
    "delivery_state": "accepted"
  }
}
```

Más tarde Los eventos de estado Meta siguen siendo estándar `message.sent`, `message.delivered`, `message.read`, `message.failed`. Sus `status` bloque incluye la misma correlación:

```json
{
  "type": "message.delivered",
  "status": {
    "message_id": "wamid.HBg...",
    "scheduled_message_id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "recipient_id": "13125550199",
    "timestamp": "2026-07-03T00:30:03.000Z"
  }
}
```

Failed status events preserve Meta's `errors` array y añadir un sistema normalizado
`status.error` cuando Easyhook puede identificar la causa:

```json
{
  "type": "message.failed",
  "status": {
    "message_id": "wamid.HBg...",
    "recipient_id": "13125550199",
    "errors": [{
      "code": 131053,
      "title": "Media upload error",
      "error_data": {
        "details": "Sticker with dimensions 406x379 has incorrect dimensions, expected dimension: 512x512"
      }
    }],
    "error": {
      "code": "invalid_sticker_dimensions",
      "message": "Sticker must be exactly 512x512 pixels. Received 406x379.",
      "provider_code": 131053,
      "retryable": false,
      "details": {
        "width": 406,
        "height": 379,
        "expected_width": 512,
        "expected_height": 512
      }
    }
  }
}
```

Uso `status.error.code` para la lógica de la aplicación y mantener el crudo `errors`
array para el diagnóstico. `message.failed` evento es terminal a menos que
informes de error normalizados explícitamente `retryable: true`.

Para errores frecuentes de entrega de WhatsApp, `status.error.details` también
incluye una `category` y una `action` prácticas. Cuando Meta publica un periodo
seguro para reintentar, Easyhook incluye `retry_after_seconds` en el mismo objeto:

| Código de Meta | `category` | Acción recomendada |
| --- | --- | --- |
| `130472` | `recipient_experiment` | No reintentes automáticamente. Usa otro canal o espera hasta que el destinatario ya no forme parte del experimento de Meta. |
| `131026` | `recipient_unreachable` | Verifica que el destinatario pueda escribirle al negocio, no lo haya bloqueado, haya aceptado los términos actuales de WhatsApp y utilice una versión reciente de la app. |
| `131049` | `marketing_frequency_limit` | No reintentes el template de marketing durante al menos `86400` segundos. |

Estos campos orientan únicamente sobre la entrega fallida; no autorizan usar
otra categoría de mensaje, destinatario, remitente ni organización como fallback.

Treat webhook delivery as at-least-once. Deduplicar eventos de ciclo de vida por alto nivel `id`, estado del mensaje por `status.message_id` más público `type`, y reconciliarse con `GET /v1/scheduled-messages/{id}` después del tiempo de inactividad de webhook.

### `account`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | WhatsApp Phone Number ID, Facebook Page ID, o Instagram account ID. Un evento WhatsApp sin un identificador de teléfono puede regresar a WABA ID. |
| `phone` | cuerda | WhatsApp teléfono de negocios en dígitos internacionales, cuando se sabe. |
| `name` | cuerda | Nombre de la pantalla del canal de Messenger Page o Instagram, cuando se sepa. |

### `contact`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | ID de proveedor remoto de rutina. Para WhatsApp esto puede ser un teléfono o un ID de usuario con un sistema operativo (BSUID); no está garantizado que contenga sólo dígitos. |
| `phone` | cuerda o nula | WhatsApp teléfono en dígitos internacionales mientras Meta lo suministra. Puede estar ausente para conversaciones de nombre de usuario primero. |
| `user_id` | cuerda o nula | WhatsApp BSUID, tales como `MX.EXAMPLE_CONTACT_ID`. Preferirlo como la clave de contacto estable cuando está presente. |
| `parent_user_id` | cuerda o nula | Opcional padre BSUID, como `MX.ENT.EXAMPLE_PARENT_ID`, cuando Meta ha habilitado la identidad enlazado-portfolio para el negocio. |
| `username` | cuerda o nula | Opcional WhatsApp nombre de usuario sin `@`. |
| `country_code` | cuerda o nula | Código de país opcional suministrado por WhatsApp. |
| `name` | cuerda | Nombre de contacto / archivo suministrado por el proveedor, cuando esté disponible. |

### `message`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | Identificación del mensaje del proveedor (`wamid`/`mid`). La clave principal de la idempotencia para un mensaje. |
| `direction` | `in` o `out` | Dirección del mensaje cuando Easyhook puede determinarlo. |
| `source` | cuerda | `history`, `whatsapp_business_app`, u otra fuente de proveedor cuando sea pertinente. |
| `from` | cuerda | Identificador del proveedor del remitente. |
| `to` | cuerda | Identificador del proveedor del destinatario. |
| `type` | cuerda | `text`, `button`, `edit`, `interactive`, `image`, `audio`, `video`, `document`, `file`, `sticker`, `reaction`, `unsupported`, o un tipo de proveedor futuro. |
| `text` | cuerda | Cuerpo de texto para mensajes de texto/edito y el título visible seleccionado en botón, rápida respuesta e interacciones de lista. |
| `subject` | cuerda | Asunto de correo electrónico para Gmail, Outlook, e IMAP/SMTP. |
| `html` | cuerda | Original email HTML cuando presente. Trate de él como contenido no confiable. |
| `thread_id` | cuerda | Identificador de hilos de correo electrónico del proveedor. |
| `message_id_header` | cuerda | Encabezamiento RFC Mensaje-ID. |
| `in_reply_to` | cuerda | Padre RFC Mensaje-ID. |
| `references` | cuerda | cadena de referencias RFC. |
| `attachments` | array | Apegos normalizados de correo electrónico, incluyendo IDs de medios Easyhook protegidos. |
| `media` | objeto | Metadatos de medios normalizados que se describen a continuación. |
| `reaction` | objeto | Mensaje objetivo y emoji. |
| `button` | objeto | Respuesta del botón de plantilla de WhatsApp con `text` y proveedor `payload`. |
| `interactive` | objeto | Respuesta interactiva WhatsApp con `type` y a `button_reply` o `list_reply` Bloqueo. |
| `edit` | objeto | ID de mensaje original, tipo de reemplazo y texto de reemplazo. |
| `referral` | objeto | Contexto de referencia de Click-to-WhatsApp/provider. |
| `unsupported` | objeto | Tipo de proveedor sin soporte y errores. |
| `timestamp` | Serie ISO 8601 | Timetamp original del proveedor después de la normalización. |
| `history` | objeto | Metadatos de hilo de historia/estatus/cunk. |

`message.media` puede contener:

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | Meta ID de medios cuando esté disponible. |
| `mime_type` | cuerda | Tipo MIME. |
| `url` | cuerda | Easyhook-authenticated descarga URL o URL del proveedor usable. |
| `caption` | cuerda | Capción de medios. |
| `filename` | cuerda | Nombre original del documento/archivo. |
| `sha256` | cuerda | Proveedor / archivo digest cuando esté disponible. |
| `size` | Número | Talla en bytes. |
| `expires_at` | Serie ISO 8601 | URL / expiración de activos cuando sea aplicable. |

`message.reply_to.message_id` identifica el mensaje original para una línea
respuesta. `message.reaction` contiene `message_id`, `action`, y opcional `emoji`
o nombre de reacción del proveedor. `action: "unreact"` elimina la reacción anterior.
`message.edit` contiene `original_message_id`, `type`, `text`, y opcional
`num_edit`; actualizar el mensaje original en lugar de insertar un segundo mensaje.
`message.unsupported` contiene `type` y opcionales
`errors[]`. `message.history` puede contener `thread_id`, `status`, `phase`,
`chunk_order`, y `progress`.

Para las respuestas del botón WhatsApp, nunca infiere la acción seleccionada de la
Definición de plantilla. Easyhook preserva los valores suministrados por Meta:

```json
{
  "message": {
    "type": "button",
    "text": "Confirmar asistencia",
    "button": {
      "text": "Confirmar asistencia",
      "payload": "confirm_attendance"
    }
  }
}
```

Respuestas rápidas interactivas y selecciones de listas utilizan el mismo visible
`message.text` campo de conveniencia y conservar su identificador estructurado:

```json
{
  "message": {
    "type": "interactive",
    "text": "Necesito cambiarla",
    "interactive": {
      "type": "button_reply",
      "button_reply": {
        "id": "change_attendance",
        "title": "Necesito cambiarla"
      }
    }
  }
}
```

Para la nueva automatización multicanal, prefiera `message.quick_reply.payload`.
Easyhook también preserva los campos de WhatsApp específicos para proveedores
`message.button.payload`, `message.interactive.button_reply.id`, y
`message.interactive.list_reply.id` para compatibilidad. Uso `message.text` sólo
Si un proveedor omite un identificador, Easyhook lo deja
ausente en lugar de adivinarlo.

### Respuestas rápidas multicanal

Los botones de respuesta seleccionados en WhatsApp, Messenger, Instagram o Telegram usan el
filtro de evento `message.quick_reply`. El evento público se normaliza como:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841400000000001" },
  "contact": { "id": "17841400000000002" },
  "message": {
    "id": "mid...",
    "direction": "in",
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Uso `message.quick_reply.payload` como el valor de routing estable. Una suscripción
a `message.*` también recibe este evento; no suscribirse a ambos filtros en
automatizaciones separadas a menos que el procesamiento duplicado sea intencional.

### Respuestas, reacciones y ediciones de canales cruzados

Easyhook utiliza los mismos campos normalizados cuando WhatsApp, Messenger o Instagram
proporciona el evento subyacente:

- Respuesta en línea: `message.reply_to.message_id`.
- Reacción: `message.reaction.message_id`, `action`, y opcional `emoji`.
- Editar: `message.edit.original_message_id`, `text`, y opcional `num_edit`.

Las capacidades del proveedor no son idénticas. Meta actualmente expone Mensajero y
Reacciones y ediciones de Instagram, y referencias de respuesta en línea de Instagram. Meta hace
no exponer Mensajero o Instagram desletion/unsend como un equivalente
webhook, por lo que Easyhook no infiere ni fabrica esos eventos.
campos opcionales desconocidos y sólo eventos de proceso que se entregaron en realidad.

### Eliminaciones de WhatsApp y avisos del sistema

Suscríbete a los nombres de los eventos del proveedor `message.revoke` y `message.system`.
Estos son eventos de mensajes normalizados, así que los entregados
de alto nivel `type` es `message.received`; la ruta de la operación con
`message.type`:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012347", "phone": "15550100005" },
  "contact": { "id": "15550100006" },
  "message": {
    "id": "wamid.edit-event",
    "type": "edit",
    "text": "Texto corregido",
    "edit": {
      "original_message_id": "wamid.original",
      "type": "text",
      "text": "Texto corregido"
    },
    "timestamp": "2026-07-31T13:33:03.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.revoke-event",
    "type": "revoke",
    "revoke": { "original_message_id": "wamid.original" },
    "timestamp": "2026-07-31T11:28:57.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.system-event",
    "type": "system",
    "system": {
      "type": "user_changed_number",
      "body": "User A changed from 15550100007 to 15550100008",
      "wa_id": "15550100008"
    },
    "timestamp": "2026-07-30T02:34:03.000Z"
  }
}
```

Reglas de consumo:

- Para `edit`, encontrar la fila existente por `message.edit.original_message_id`,
  sustituir su texto por `message.edit.text` (o `message.text`), y marcarlo como
  editado. No inserte un segundo mensaje de chat.
- Para `revoke`, encontrar la fila existente por
  `message.revoke.original_message_id`, marcarlo como revocado, y ocultar o limpiar
  no inserte un mensaje de chat independiente.
- Para `system`, pantalla `message.system.body` como un aviso informativo.
  `user_changed_number`, uso `message.system.wa_id` como nuevo WhatsApp
  identidad según la política de contacto de la aplicación.
- Deduplicar cada webhook con nivel superior `id`. Utilice el WAMID original para el
  actualización del mensaje; el evento `message.id` identifica la edición, revocación o
  evento del sistema en sí mismo.
- Nunca render estos eventos como un mensaje vacío genérico cuando su especialidad
  El bloque está presente.

### `status`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `message_id` | cuerda | Identificación del mensaje del proveedor cuyo estado cambió. |
| `recipient_id` | cuerda | Número de teléfono principal, cuando Meta lo suministra. |
| `recipient_user_id` | cuerda | Recipiente BSUID. Meta lo incluye para eventos de estado de WhatsApp. |
| `parent_recipient_user_id` | cuerda | Opcional padre BSUID para carteras vinculadas elegibles. |
| `timestamp` | Serie ISO 8601 | Hora del estado del proveedor. |
| `conversation` | objeto | Meta de metadatos de conversación/pricing-ventana. |
| `pricing` | objeto | Meta campos de fijación de precios, pasados como un objeto compacto. |
| `errors` | array | Meta objetos de falla cuando se suministra. |

`status.conversation` puede contener `id`, `expires_at`, `origin`, y
`free_entry_point`. Una entrega fallida debe ser manejada `status.errors`
sin asumir un esquema de error de proveedor fijo.

### `template`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | Meta ID de plantilla. |
| `name` | cuerda | Nombre de plantilla. |
| `language` | cuerda | Código de lenguaje de plantilla. |
| `status` | cuerda | Meta de actualización de evento/estadio. |
| `quality` | cuerda | Nuevo valor de calidad. |
| `category` | cuerda | Nuevo valor de categoría. |
| `reason` | cuerda | Meta código/texto de la razón. |
| `description` | cuerda | Descripción del proveedor. |

### `flow`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `submission_id` | cuerda | Stable Easyhook/provider identidad de sumisión. |
| `id` | cuerda | Meta Flow ID. |
| `name` | cuerda | Apellido. |
| `token` | cuerda | Aplicación correlación token suministrado al enviar el Flujo. |
| `action` | cuerda | Flujo de acción, comúnmente `complete`. |
| `screen` | cuerda | Identificación de pantalla pasada/presentada. |
| `data` | objeto | Submitted Flow fields. Treat keys as Flow-definido datos dinámicos. |

### `onboarding`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | cuerda | Hosted onboarding session ID. |
| `status` | cuerda | Situación del período de sesiones. |
| `url` | cuerda | Hosted onboarding URL, cuando sea aplicable. |
| `expires_at` | Serie ISO 8601 | Caducidad de la sesión. |
| `organization` | objeto | Propietario de datos de la organización Easyhook: `name`, `slug`, y público opcional `logo_url`. |
| `signup_mode` | cuerda | `cloud_api` o `coexistence`. |
| `customer_name`, `customer_email` | cuerda | Referencias de llamada opcionales. |
| `return_url` | cuerda | URL de retorno de llamada. |
| `metadata` | objeto | Metadatos de correlación suministrados por el californista. |
| `waba`, `phone` | objeto | Meta de detalles de activos conectados después de la terminación. |

### `call`

proveedor de uso de eventos de voz `voice` para eventos de routing normalizados y conservar el
proveedor subyacente (`telnyx` o `whatsapp`) en `data.provider`.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `call_id` | UUID string | Stable Easyhook llama identidad. |
| `provider` | cuerda | `telnyx` o `whatsapp`. |
| `direction` | cuerda | `inbound` o `outbound`. |
| `from`, `to` | cuerda | Fiestas de llamadas normalizadas. |
| `endpoint_id` | UUID string | El único punto final que se ofrece actualmente o que mantiene la llamada. |
| `external_agent_id` | cuerda | Identidad de agente API/SIP definida por el cliente, cuando sea aplicable. |
| `sequence` | entero | Rutante número de intento. |
| `lease_until` | Serie ISO 8601 | Hora en que Easyhook avanza a otro punto final. |
| `conversation_type`, `conversation_id` | cuerda | Una conversación enlazada en la bandeja de entrada, cuando uno podría resolverse. |
| `transfer_destination` | E.164 string | Destino externo configurado cuando `call.transfer_started` es emitido. |

Suscríbete `call.offered` para llamar a una aplicación del cliente y atomically call
`POST /v1/calls/{id}/actions/claim`. `call.claimed` confirma al ganador;
eventos de ciclo de vida del proveedor como `call.ringing`, `call.answered`,
`call.connect`, `call.hangup`, y `call.terminate` reconciliar el estado final.
no sonar un punto final que no fue nombrado en la corriente `call.offered` evento.
`call.transfer_started` confirma que Easyhook reservó la cartera de arrendatario y
aceptó una transferencia gestionada al número externo configurado; portaaviones finales
el uso sigue siendo reconciliado por el ciclo de vida de Telnyx firmado normal.

Las respuestas de la llamada-permisión de WhatsApp llegan como un mensaje interactivo entrante
`message.interactive.call_permission_reply` que contiene la respuesta de Meta,
permanencia, cronograma de vencimiento y fuente de respuesta.

### `sync`

Los eventos de ciclo de vida pueden contener `id`, `status`, `media_mode`, `progress`,
`history_events`, `state_events`, `media_pending`, `media_completed`, `phase`,
`chunk_order`, `error`, y `updated_at`.

### Bloques de actualización y error

- `account_update`: `event`, `phone_number`, y proveedor `details`.
- `contact_update`: `type`, `action`, `provider_id`, `user_id`, `name`, y
  `timestamp`.
- `error`: `code`, `title`, `message`, y opcionalmente
  `provider_message_id`.

No requieren todos los campos opcionales documentados. Meta omite campos dependiendo de
canal, tipo de mensaje, permisos de cuenta y ruta de generación de eventos.

## Historia de la coexistencia

WhatsApp Business La historia de la coexistencia de App se normaliza en los mismos mensajes públicos eventos utilizados para el tráfico en vivo:

- Mensajes recibidos de un uso de contacto `type: message.received` y `message.direction: in`.
- Mensajes enviados previamente por el uso del negocio `type: message.echo` y `message.direction: out`.
- Ambos incluyen `message.source: history` para que los consumidores puedan distinguir la historia sincronizada de los eventos en vivo.
- Ambos incluyen `message.from` y `message.to` para que los consumidores puedan recorrer la historia de entrada y salida sin inferir a los participantes de la dirección.
- `message.history` puede incluir `thread_id`, `status`, `phase`, `chunk_order`, y `progress` cuando Meta los suministra.

Las cargas de pago de historia se reconocen y persisten antes del procesamiento asincrónico. Easyhook procesa y entrega en la mayoría de 100 eventos por lote. Duplicar Meta IDs de mensaje no crean mensajes almacenados duplicados.

Historia inicial y sincronización del Estado de App se incluye sin cargo adicional. Sólo una sincronización puede funcionar por número de WhatsApp a la vez. Una organización puede procesar hasta dos de sus números simultáneamente; este es un límite de equidad, no un límite en números conectados o importaciones totales. `history.*` y `smb_app_state_sync.*` antes de conectar o solicitar la sincronización, mantén el punto final disponible, y espera que grandes cuentas continúen importando en el fondo después de que Meta termine a bordo.

Meta documenta la historia como una importación de hasta 180 días y excluye las conversaciones de grupo. No es la copia de seguridad completa de iCloud/Google Drive del teléfono. Ver el oficial de Meta [History webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history) y [SMB App State Sync reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

Importaciones históricas nunca desencadenan el manejo de palabras clave de consentimiento en vivo o replay Efectos secundarios de la presentación de flujo. `history.*` eventos cliente webhook.

Suscríbete `history.*` antes de conectar o solicitar la sincronización de convivencia cuando el destino debe recibir la importación histórica completa. `message.*`; Live WhatsApp Business App ecos use `smb_message_echo.*`.

El selector de suscripción utiliza el evento del proveedor (`history.*`). Easyhook envía `{ "type": "sync.batch", "sync": {...}, "events": [...] }`, con más de 100 eventos normalizados en `events`. Cada evento mantiene el público estándar `type` (`message.received` o `message.echo`). Tampoco `message.*` ni tampoco `smb_message_echo.*` recibe la importación histórica.

Envoltorio completo para lotes:

```json
{
  "id": "sync_batch_abc123",
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync_session_uuid",
    "source": "history",
    "phase": 1,
    "chunk_order": 2,
    "progress": 80,
    "cursor": 300,
    "count": 100,
    "total": 1200
  },
  "events": [
    {
      "id": "event_uuid",
      "type": "message.received",
      "channel": "whatsapp",
      "account": { "id": "123456789012345", "phone": "15550100002" },
      "contact": { "id": "15550100004" },
      "message": {
        "id": "wamid...",
        "direction": "in",
        "source": "history",
        "from": "15550100004",
        "to": "15550100002",
        "type": "text",
        "text": "Previous message",
        "timestamp": "2026-07-01T10:00:00.000Z"
      }
    }
  ]
}
```

El lote exterior utiliza `provider` para compatibilidad atrasada mientras que cada
usos del evento interior normalizados `channel`. Replay batches additionally contain
`sync.replay: true`; sus `sync.id` es el ID de repetición y `phase`,
`chunk_order`, `progress` puede estar ausente.

Lo mismo `history.*` suscripción recibe objetos de ciclo de vida por separado de lotes:

```json
{
  "id": "event_uuid",
  "type": "sync.progress",
  "channel": "whatsapp",
  "sync": {
    "id": "sync_uuid",
    "status": "progress",
    "media_mode": "recent_media",
    "progress": 100,
    "history_events": 1200,
    "state_events": 430,
    "media_pending": 8,
    "media_completed": 12
  }
}
```

`sync.progress.progress` es Meta reportó progreso de la ingestión. `history_events` y `state_events` son los contadores procesados de Easyhook. La terminación es explícita a través de `sync.completed`; no inferirlo sólo de `progress: 100`.

El negocio debe permitir el intercambio de historia en la App Business de WhatsApp durante la coexistencia a bordo y debe mantener la aplicación abierta mientras comienza la sincronización inicial. Si el intercambio de historia es deshabilitado, Meta puede devolver el error `2593109`; Easyhook lo entrega al mismo `history.*` suscripción `type: sync.failed`.

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "message": {
    "id": "wamid...",
    "direction": "out",
    "source": "history",
    "from": "15550100002",
    "to": "15550100004",
    "type": "text",
    "text": "Previous reply",
    "history": {
      "thread_id": "15550100004",
      "status": "READ",
      "phase": 1,
      "chunk_order": 2,
      "progress": 80
    }
  }
}
```

### Normas de cartografía de los consumidores

Tratar cada elemento de `events` como un mensaje normalizado. El objeto externo es un lote de entrega Easyhook, no el crudo de Meta `messages[]`, `contacts[]`, `history[]` carga útil.

- Uso `account.id + ":" + (contact.user_id ?? contact.id)` como la clave de conversación. El ID de cuenta es necesario porque un BSUID tiene alcance para el negocio y la misma persona puede hablar con más de un número conectado.
- Uso `message.id` (el Meta `wamid`) como la clave de deduplicación del mensaje. Webhook y el procesamiento del flujo de trabajo debe ser idempotente.
- Ordenar mensajes importados por `message.timestamp`, no por el tiempo de llegada webhook. Las conversaciones separadas pueden ser procesadas simultáneamente, por lo que el orden de entrega global no es significativo.
- Para `message.direction: in`, `contact` es el remitente y `account` es el número de Easyhook receptor.
- Para `message.direction: out`, `account` es el remitente y `contact` es el receptor.
- Los nombres de usuario de WhatsApp pueden ocultar el número de teléfono de la persona. Meta luego identifica el contacto con un ID de usuario (BSUID), como por ejemplo `MX.EXAMPLE_CONTACT_ID`. Easyhook almacena alias teléfono/BSUID cuando Meta suministra y preserva el BSUID en `contact.user_id`; las carteras vinculadas elegibles también reciben `contact.parent_user_id`. `contact.phone` y situación `recipient_id` puede estar ausente, mientras normalizado `message.from`/`message.to` permanecer routable con el teléfono o BSUID. Nunca requiera dígitos, invente un teléfono, o tira cartas y puntuación de estos identificadores.
- Durante la ventana de transición de Meta un Webhook puede contener ambos `contact.phone` y `contact.user_id`; guardar ambos. Un Webhook posterior puede contener sólo el BSUID y todavía pertenece al mismo contacto.
- En registros históricos raros, Meta puede omitir cada campo de contacto remoto. Easyhook emite `type: sync.failed` con `error.code: missing_remote_contact` y `error.provider_message_id` en lugar de publicar un inutilizable `message.received` o `message.echo`Mantenga el resto de la importación y registre este artículo como terminal a menos que Meta posteriormente provea la identidad perdida.
- No active auto-replies en vivo, detección de palabras clave de consentimiento, u otras automatizaciones de entrada en tiempo real cuando `message.source === "history"` a menos que el comportamiento de repetición sea explícitamente destinado.
- Una suscripción a la historia puede recibir `sync.failed`; manéjelo separado de los eventos de mensajes y mantenga el flujo de trabajo seguro de reingreso.
- La entrega es al menos una vez. Easyhook retries falló los lotes hasta cinco veces con backoff; siempre deduplicado por `message.id`.
- Easyhook procesa una sincronización por número de WhatsApp y hasta dos números simultáneamente por organización. Los números adicionales permanecen apagados y se reanudarán automáticamente; el tiempo dedicado a la espera de la capacidad no consume intentos de entrega o de sincronización.
- Los medios históricos se importan independientemente. Un mensaje puede llegar primero con
  metadatos de medios o un marcador de lugar y luego llegan como
  `message.media_available` con el mismo `message.id` y una URL de descarga.
  no retrasar la importación de la conversación mientras espera a los medios de comunicación o tratar
  evento de disponibilidad como un nuevo mensaje de cliente.
- Easyhook honra un destino válido `Retry-After` valor, entonces utiliza `30s`, `2m`, `10m`, `1h`, y `6h` Después de cinco intentos fallidos, la entrega permanece en la lógica cola mortal hasta la repetición.

### Reproducción de la historia almacenada

La reintentación de las entregas fallidas de HTTP y la repetición de la importación almacenada son operaciones separadas:

```bash
# Retry failed batches that already exist in the outbox.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"sync_id":"SYNC_ID","limit":100}'

# Re-read stored messages and send them to this active history webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"history"}'

# Re-read stored contacts and send them to an active smb_app_state_sync webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"contacts"}'
```

La segunda respuesta contiene `replay.id`. Revisar el progreso con:

```bash
curl https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays/REPLAY_ID \
  -H "Authorization: Bearer eh_live_xxx"
```

Los murciélagos de repetición usan el mismo `sync.batch` contrato y añadir `sync.replay: true`. Juego de reproducciones de mensajes `sync.source: history`; juego de replays de contacto `sync.source: smb_app_state_sync`. Guarda de mensajes `message.id`, mientras que los contactos conservan su identidad de evento normalizada. Sólo se permite una repetición activa de cada tipo para el mismo webhook y número.

### Política histórica de medios de comunicación

Elija la política al solicitar una sincronización:

| `media_mode` | Comportamiento |
| --- | --- |
| `metadata` | Importa mensajes y metadatos de medios sin descargar archivos. |
| `recent_media` | Descargas disponibles imágenes recientes, audio, documentos y pegatinas; salta el vídeo. Este es el predeterminado. |
| `all_recent_media` | También descargas disponibles vídeo reciente. |

Meta generalmente expone los IDs de medios descargables sólo para los medios históricos recientes (aproximadamente los últimos 14 días). `media_placeholder`; los medios perdidos nunca fallan la importación del mensaje. Almacenamiento y transferencia utilizan las cuotas normales de medios Easyhook.

Cuando Meta envía `media_placeholder` sin una identificación de medios, Easyhook emite `message.media.storage_status: "unavailable"` y `placeholder: true`. No existe ningún archivo para descargar en ese caso. Los consumidores deben mostrar un marcador de lugar y esperar a `message.media_available`; no deben tratarlo como un mensaje de texto vacío.

Para `edit`, actualizar la fila existente identificada por
`message.edit.original_message_id`. Para `revoke`, uso
`message.revoke.original_message_id` para marcar el mensaje existente como eliminado.
Para `system`, pantalla `message.system.body` como un aviso informativo y hacer
no tratarlo como un nuevo mensaje del cliente o abrir una ventana de servicio.
Las reglas de mapeo se aplican cuando estos registros llegan dentro de un lote de Historia.

## Coexistence App State Sync

El `smb_app_state_sync.*` Filtro recibe registros de contacto y de aplicación importados de la App Business de WhatsApp. Easyhook emite un evento normalizado por registro:

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100004",
    "user_id": "MX.EXAMPLE_CONTACT_ID",
    "parent_user_id": "MX.ENT.EXAMPLE_PARENT_ID",
    "name": "Customer"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "15550100004",
    "user_id": "MX.EXAMPLE_CONTACT_ID",
    "parent_user_id": "MX.ENT.EXAMPLE_PARENT_ID",
    "name": "Customer",
    "timestamp": "2026-07-18T15:20:00.000Z"
  }
}
```

`contact_update.type` y `contact_update.action` preservar la clasificación de registros de Meta. Los consumidores no deben codificar una lista cerrada de valores. `contact_update.provider_id`, `contact_update.user_id`, y opcional `contact_update.parent_user_id`, y procesar actualizaciones repetidas idempotentemente. Los BSUIDs son opacos y no deben ser reformados como números de teléfono.

## Preferencias de usuario de WhatsApp

Suscríbete `user_preferences.*` para recibir Meta cambios de referencia de marketing como `user.preference_updated`. La normalización `contact` retiene el teléfono, BSUID, el padre BSUID y el nombre de usuario cuando se suministra; `user_preference` contiene `category`, `detail`, `value`, y `timestamp`. Los campos de teléfono pueden estar ausentes para los usuarios habilitados para el nombre de usuario.

Ver Meta's [Business-scoped User IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids) documentación y [WhatsApp nombre de usuario anuncio](https://about.fb.com/news/2026/06/its-time-to-reserve-your-whatsapp-username/) para la transición del proveedor.

Suscribirse a ambos `smb_app_state_sync.*` y `history.*` antes de comenzar la sincronización de la coexistencia cuando el destino necesita tanto el estado de contacto importado como conversaciones históricas. Los eventos estatales-sincánicos no contienen mensajes históricos; los eventos de la historia no reemplazan las actualizaciones del estado de contacto.

## Metadatos de contacto locales actualizados

Suscríbete `contact.updated` para recibir los cambios realizados `PUT /v1/contacts`. Estos eventos describen los metadatos locales de Easyhook y están separados de la orginación del proveedor `smb_app_state_sync.*` eventos.

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": {
    "id": "15550100004",
    "phone": "15550100004",
    "name": "Ana",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "15550100004",
    "name": "Ana Garcia",
    "preferred_name": "Ana",
    "source": "easyhook_api",
    "write_target": "easyhook",
    "provider_contact_book_updated": false,
    "timestamp": "2026-08-12T18:30:00.000Z"
  }
}
```

Este evento hace **no** significa que el libro de direcciones de WhatsApp Business App cambió. Meta actualmente expone la sincronización de contacto/app-state hacia proveedores, pero ninguna operación de Cloud API para escribir un nombre de contacto de nuevo en ese libro de direcciones.

## Consentimiento Actualizado

Suscríbete `consent.updated` para reaccionar al opt-in, el opt-out y la opción de exclusión pendiente
cambios sin encuestar el punto final del estado. Easyhook emite el evento sólo cuando
la evidencia permanece en el registro de auditoría de la organización
y nunca se incluye en el webhook del cliente.

```json
{
  "id": "event_uuid",
  "type": "consent.updated",
  "channel": "whatsapp",
  "account": { "id": "123456789012345" },
  "contact": { "id": "15550100002" },
  "consent": {
    "contact": "15550100002",
    "scope": "marketing",
    "status": "opt_out",
    "previous_status": "opt_in",
    "source": "whatsapp_flow",
    "updated_at": "2026-07-31T18:00:00.000Z"
  }
}
```

Utilice el nivel superior `id` como la clave de la idempotencia. `scope` es `service` o
`marketing`; `status` es `opt_in`, `opt_out`, `pending_opt_out`Query the
estado actual completo con `GET /v1/consent/status` cuando conciliar un CRM.
`pending_opt_out` sólo informa que Easyhook envió un flujo de confirmación.
no revocar un opt-in existente. La solicitud pendiente expira después de una hora si
el contacto no presenta el flujo.

## Mensaje de Medios

Los campos de los medios se normalizan a través de los canales. `url` se incluye cuando Easyhook almacena los medios o Meta suministra una URL usable.

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004", "name": "Customer" },
  "message": {
    "id": "wamid...",
    "type": "image",
    "media": {
      "id": "META_MEDIA_ID",
      "mime_type": "image/jpeg",
      "url": "https://api.easyhook.dev/v1/media/asset_uuid/download",
      "caption": "Photo",
      "size": 48231,
      "expires_at": "2027-01-11T00:00:00.000Z"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

La URL puede contener un activo interno UUID porque es un recurso de descarga opaca. Ningún activo separado UUID está expuesto en el JSON.

Las notas circulares de vídeo de WhatsApp llegan actualmente desde Meta como mensajes sin soporte sin un ID de medios o URL:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "unsupported",
    "unsupported": {
      "type": "video_note",
      "errors": [{ "code": 131051, "message": "Message type unknown" }]
    }
  }
}
```

## Reacciones

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.target",
      "emoji": "❤️"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

Un vacío. `emoji` elimina la reacción anterior. Reacciones enviadas desde la App Business de WhatsApp conectadas utilizan el tipo público `message.echo`.

## Estado de expedición

```json
{
  "id": "event_uuid",
  "type": "message.delivered",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "status": {
    "message_id": "wamid...",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

Los estados fallidos incluyen `errors` sólo cuando Meta los suministra.

### Click-to-WhatsApp y el punto de entrada libre de 72 horas

Un mensaje de entrada que se originó de un punto de entrada de Click-to-WhatsApp elegible puede incluir el contexto de referencia de Meta:

```json
{
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "text",
    "text": "Quiero informacion",
    "referral": {
      "source_type": "ad",
      "source_id": "ad_123",
      "source_url": "https://fb.me/...",
      "headline": "Oferta",
      "ctwa_clid": "clid_123"
    }
  }
}
```

El objeto de referencia identifica el punto de entrada pero no prueba por sí mismo que la ventana de 72 horas se abrió. Meta confirma la conversación activa de punto de entrada libre en un evento de estado de salida:

```json
{
  "type": "message.sent",
  "channel": "whatsapp",
  "status": {
    "message_id": "wamid...",
    "conversation": {
      "id": "conversation_123",
      "expires_at": "2026-07-13T10:01:00.000Z",
      "origin": "referral_conversion",
      "free_entry_point": true
    },
    "pricing": {
      "billable": false,
      "model": "PMP",
      "category": "referral_conversion"
    }
  }
}
```

La ventana de 72 horas describe Meta pricing. Los mensajes de forma gratuita todavía requieren la ventana de servicio al cliente las 24 horas.

Con los precios actuales del mensaje, Meta puede omitir el legado `conversation` bloque y vuelta en lugar de `pricing.model = PMP` con `pricing.type = free_entry_point`Easyhook reconoce ambos formatos.

## Flow Submission

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "flow": {
    "submission_id": "submission_uuid",
    "id": "META_FLOW_ID",
    "name": "lead_capture",
    "token": "customer_123",
    "action": "complete",
    "screen": "LEAD",
    "data": {
      "name": "Example User",
      "service_opt_in": true
    }
  }
}
```

Los campos de consentimiento en un Flow presentado continúan actualizando el estado de consentimiento de Easyhook antes de la entrega.

## Hosted Onboarding

Suscríbete `onboarding.*` para recibir eventos de ciclo de vida de registro organizados:

```json
{
  "id": "event_uuid",
  "type": "onboarding.completed",
  "channel": "whatsapp",
  "onboarding": {
    "id": "session_uuid",
    "status": "completed",
    "signup_mode": "coexistence",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" },
    "connection": {
      "channel_id": "channel_uuid",
      "account_id": "123456789012345",
      "display_name": "Support",
      "provider": "whatsapp"
    },
    "waba": { "id": "123456789012348", "name": "Business" },
    "phone": {
      "id": "123456789012345",
      "display_phone": "+1 312 555 0100",
      "quality": "GREEN"
    }
  }
}
```

`onboarding.completed` está escrito a la misma caja de salida persistente utilizada por otros
eventos del cliente webhook. Utilice el suministro de Easyhook normal id/idempotency
contrato: las entradas no representan una segunda conexión de canal.

## Headers and Security

Cada entrega incluye:

```http
Content-Type: application/json
User-Agent: Easyhook-Webhooks/1.0
X-Easyhook-Delivery: <delivery_uuid>
X-Easyhook-Event: <public_type>
X-Easyhook-Provider-Event: <filter/debug_event>
X-Easyhook-Timestamp: <unix_seconds>
```

Modos de autenticación:

| Modo | Header |
| --- | --- |
| `hmac` | `X-Easyhook-Signature: sha256=<hex>` |
| `bearer` | `Authorization: Bearer <secret>` |
| `custom_header` | Encabezamiento configurado y secreto generado |
| `none` | No autenticación; pruebas solamente |

Cálculo HMAC:

```text
hex_hmac_sha256(secret, raw_request_body)
```

El secreto se devuelve sólo cuando se crea la suscripción.

## Salud del Canal

Suscríbete `channel.health_changed` para aprender cuando un WhatsApp conectado,
Mensajero, Instagram, correo electrónico u otro remitente compatible cambia el estado de salud.
El evento se emite sólo en una transición estatal:

```json
{
  "id": "event_uuid",
  "type": "channel.health_changed",
  "channel": "messenger",
  "account": { "id": "123456789012346", "name": "Easyhook" },
  "channel_health": {
    "status": "reauthorization_required",
    "previous_status": "connected",
    "action_required": true,
    "checked_at": "2026-08-22T09:19:07.211Z",
    "code": "meta_asset_unavailable",
    "message": "Provider asset is unavailable to the current credential"
  }
}
```

Treat `unreachable` como potencialmente temporal y `reauthorization_required` como tal
un impulso explícito de reconexión. Los consumidores pueden conciliar el estado actual en cualquier momento
con `GET /v1/senders` o `GET /v1/senders/{account_id}/health`.

## n8n

Instala:

```text
n8n-nodes-easyhook
```

Añadir **Easyhook Trigger**, seleccione la credencial y proveedor Easyhook, luego elija entre los eventos compatibles y las cuentas de alcance conectada cargadas por Easyhook. Activar el flujo de trabajo para registrar su URL de producción y secreto HMAC automáticamente. La desactivación elimina la suscripción.

Para la historia de la convivencia:

1. Elija `Provider: WhatsApp`.
2. Elija `Event: Coexistence history (history.*)`.
3. Seleccione `Organization`, `WABA`, `WhatsApp number` y la cuenta correspondiente cuando sea necesario.
4. Activar el flujo de trabajo antes de conectar el teléfono o pulsar sincronización de convivencia en Easyhook.
5. En la App Business de WhatsApp a bordo, permite compartir historia y mantener la aplicación abierta mientras comienza la sincronización.

Cada lote Easyhook comienza una ejecución de n8n y se expande en la mayoría de los 100 elementos de salida. `message.direction` para distinguir la entrada (`in`) de salida (`out`), uso `message.source === "history"` para distinguir los mensajes importados del tráfico en vivo, e inspeccionar `sync` metadatos copiados en cada elemento de activación para sesión, cursor, repetición y progreso. Easyhook crea y firma la suscripción n8n automáticamente; no se requiere segundo webhook en el portal.

Si un flujo de trabajo fue inactivo o su viejo mapeo rechazó parte de una importación, active el flujo de trabajo corregido y use **Reenviar historial** en el correspondiente Easyhook en el portal. Esto reutiliza la importación almacenada; no reconecta el teléfono ni solicita otra exportación Meta.

Si Meta no puede iniciar la importación, el gatillo puede recibir:

```json
{
  "type": "sync.failed",
  "channel": "whatsapp",
  "error": {
    "code": "2593109",
    "message": "History sync is turned off by the business from the WhatsApp Business App"
  }
}
```

El gatillo obtiene estas opciones de `GET /v1/webhooks/options`. El punto final está restringido al organización de la clave de API y devuelve etiquetas de visualización y alias públicos, nunca fichas de proveedor o ID de organización interno.

## Facturación y entrega

- No se facturan metas de ingestión y actualizaciones de portales.
- Los mensajes entrantes y cada entrega a un endpoint suscrito son gratuitos.
- Wallet balance nunca bloquea la entrega del cliente webhook.
- Los intentos se registran para la auditoría.
- Las entregas utilizan una caja de salida persistente y retratar solicitudes fallidas hasta cinco veces con backoff. Easyhook honra una válida `Retry-After` respuesta y soporte la repetición controlada a través `POST /v1/webhooks/{id}/replay`.

Los medios de comunicación entrantes se mantienen durante hasta seis meses. Cada organización incluye `10 GB/month` transferencias y `100 GB` almacenamiento activo recibido-media; los excesos documentados se aplican más allá de esas cuotas.

## Puntos finales internos de Meta

Los clientes no llaman estos puntos finales:

```http
GET  /v1/meta/whatsapp/webhook
POST /v1/meta/whatsapp/webhook
GET  /v1/meta/messaging/webhook
POST /v1/meta/messaging/webhook
```

Easyhook verifica Meta firmas, almacena cada evento, actualiza el portal, luego entrega sólo las suscripciones de clientes coincidentes.
