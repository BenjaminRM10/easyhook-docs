# Guía de integración de agentes Easyhook

Última actualización: 2026-08-20

Este archivo es el punto de entrada para un agente de programación que integra Easyhook.
Es intencionalmente conciso. Los contratos normativos son:

1. [API pública](/api-reference): cada endpoint de cliente, parámetro de solicitud,
   respuesta, error, regla de facturación, y ejemplo.
2. [Webhooks para clientes](/webhooks): API de suscripción, filtros,
   encabezados de seguridad, nombres de campos JSON normalizados, lotes de historial y reintentos.

No inventes campos a partir de la documentación del proveedor ni uses ejemplos antiguos de Easyhook.
Easyhook acepta internamente eventos de proveedores, pero expone su propio contrato público,
compacto y normalizado.

## Inputs de integración

Obtenga esto del propietario de la organización Easyhook:

```text
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=provider-native account ID or connected WhatsApp number
EASYHOOK_WEBHOOK_URL=https://your-app.example/webhooks/easyhook
```

La clave de API determina la organización. Nunca envíes `tenant_id` a un endpoint
público. `from` debe resolverse a un canal conectado que pertenezca a esa organización.
Prefiere el `account.id` nativo del proveedor recibido en los webhooks de Easyhook.
WhatsApp también acepta el número internacional conectado; no agregues los prefijos
`page_` o `ig_`.

`channel` normalmente es opcional. Si `from` está conectado a más de un canal
compatible, Easyhook devuelve `409 ambiguous_sender` y `available_channels`;
reintenta con el valor correcto, como `whatsapp` o `sms`. Nunca lo adivines ni
apliques un fallback silencioso.

Para WhatsApp, incluye siempre el código internacional del país. Easyhook acepta
valores internacionales con espacios, guiones, paréntesis, sólo dígitos o el prefijo
internacional `00`. No infiere el país a partir de un número nacional. Las variantes
mexicanas `52`/`521` y argentinas `54`/`549` se normalizan automáticamente.

## Minimal Send

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: customer-123-message-456" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Hola"
  }'
```

Usa un `Idempotency-Key` estable para cada escritura que la aplicación pueda reintentar.
No reutilices la misma clave para dos operaciones lógicas diferentes.

Para un mensaje programado, también envíe una solicitud de propiedad `client_reference`:

```json
{
  "from": "15550100002",
  "to": "15550100003",
  "body": "Recordatorio",
  "at": "2026-07-25T10:00:00-06:00",
  "client_reference": "appointment-reminder-456"
}
```

Guarda el `scheduled_message.id` devuelto. Suscríbete a `scheduled.*` y `status.*`.
`scheduled.sent` proporciona el ID del mensaje del proveedor; los eventos de estado
posteriores incluyen `scheduled_message_id` y `client_reference`. Después de un timeout
o una interrupción de webhooks, reconcilia el estado con:

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Nunca correlaciones un mensaje programado por destinatario, nombre de plantilla o marca de tiempo.
`client_reference` acepta hasta 200 caracteres. Trata la respuesta HTTP como confirmación
de la programación: una referencia generada localmente sin un `scheduled_message.id`
devuelto no demuestra que Easyhook recibió la solicitud.

## Configuración mínima de webhooks

Descubre las opciones válidas primero:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

Crea la suscripción:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production app",
    "url": "https://your-app.example/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*", "scheduled.*"],
    "auth_type": "hmac",
    "scope": {
      "type": "phone",
      "from": "15550100002"
    }
  }'
```

Guarda inmediatamente el `secret` devuelto; Easyhook sólo lo muestra una vez.

Valida el cuerpo HTTP bruto exacto:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function validEasyhookSignature(
  rawBody: Buffer,
  received: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

Valida antes de interpretar el JSON. Responde rápidamente con HTTP `2xx` y procesa
el evento de forma asíncrona.

## Reglas de enrutamiento

- Usa `type` para elegir el bloque del payload.
- Usa `channel` para distinguir `whatsapp`, `messenger`, `instagram`, `telegram`,
  `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, y `tiktok`.
- Para WhatsApp, usa `account.id + ":" + (contact.user_id ?? contact.id)` como
  identidad de la conversación. `contact.id`, `message.from`, `message.to` y los
  destinatarios de estados pueden ser BSUID opacos en lugar de números telefónicos.
  Conserva `contact.phone` por separado cuando exista y nunca elimines letras o
  signos de puntuación de un BSUID. Los BSUID padre también pueden aparecer como
  `contact.parent_user_id`; consérvalos como alias opacos y envíalos sin cambios en
  el campo `to` de Easyhook.
- Usa `message.id` como clave de idempotencia del mensaje.
- Para TikTok, conserva el opaco `account.id`, estable `contact.id`,
  `message.thread_id` y `message.id`. No agregues prefijos ni los trates como
  números telefónicos. Usa `contact.id` o `message.thread_id` como `to`. Una
  empresa puede enviar como máximo 10 respuestas durante las 48 horas posteriores
  a cada mensaje del usuario y no puede iniciar una conversación.
- Usa el `id` del webhook como clave de idempotencia para eventos que no sean mensajes.
- Para `message.type: button`, dirige la automatización con `message.button.payload`
  y usa `message.button.text`/`message.text` como etiqueta visible.
- Para `message.type: interactive`, dirige respuestas rápidas y listas con
  `message.interactive.button_reply.id` o
  `message.interactive.list_reply.id`; no deduzcas una selección por el orden o
  título de los botones de una plantilla.
- Cuando `message.type` sea `edit`, actualiza la fila identificada por
  `message.edit.original_message_id` con `message.edit.text`; no insertes un
  segundo mensaje.
- Para WhatsApp, Messenger e Instagram, usa las mismas estructuras opcionales cuando
  estén presentes: `message.reply_to.message_id`, `message.reaction.message_id` más
  `action`/`emoji`, y `message.edit.original_message_id` más `text`.
  Las capacidades varían por proveedor; nunca deduzcas una reacción, edición,
  respuesta o eliminación ausente a partir del texto o del tiempo.
- Cuando `message.type` sea `revoke`, marca como revocada la fila identificada por
  `message.revoke.original_message_id` y oculta su contenido; no insertes un mensaje independiente.
- Cuando `message.type` sea `system`, muestra `message.system.body` como aviso informativo.
  Para `user_changed_number`, usa `message.system.wa_id` como nueva identidad del
  proveedor según la política de consolidación de contactos de la aplicación.
- `message.direction: in` significa que el contacto envió el mensaje.
- `message.direction: out` significa que la cuenta conectada envió el mensaje.
- `message.source: history` es una importación, no una acción del cliente en vivo.
  Nunca respondas automáticamente de forma predeterminada.
- Los campos y valores enum desconocidos, así como `event.received`, deben ignorarse
  de forma segura.
- Los bloques opcionales se omiten en vez de enviarse como `null`.

## Historial y contactos

Suscríbete a `history.*` y `smb_app_state_sync.*` antes de solicitar una
sincronización de coexistencia.

El historial llega como:

```json
{
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync-id",
    "source": "history",
    "count": 100,
    "total": 1000
  },
  "events": []
}
```

Recorre `events`. Un lote contiene como máximo 100 eventos normalizados. La entrega
es al menos una vez, por lo que debes insertar o actualizar mensajes por `message.id`
y contactos por la identidad del proveedor. Ordena los mensajes importados por
`message.timestamp`, no por la hora de llegada.

`message.media_available` actualiza el mensaje existente con el mismo
`message.id`; no es un nuevo mensaje de conversación. `sync.failed` no invalida
los eventos importados correctamente.

## Selección de API

| Objetivo | Punto final |
| --- | --- |
| Validar la clave | `GET /v1/me` |
| Listar remitentes | `GET /v1/senders` |
| Desconectar un remitente después de confirmación explícita | `DELETE /v1/senders/{account_id}` |
| Enviar texto | `POST /v1/messages/text` |
| Enviar respuestas rápidas de Messenger/Instagram | `POST /v1/messages/quick-replies` |
| Enviar texto multicanal humanizado | `POST /v1/messages/humanized-text` (WhatsApp, Messenger, Instagram o Telegram; los controles de presencia son el mejor esfuerzo) |
| Enviar medios | `POST /v1/messages/media` |
| Enviar plantilla | `POST /v1/messages/template` |
| Subir los medios de encabezado de plantilla | `POST /v1/templates/media` |
| Enviar Flow | `POST /v1/messages/flow` |
| Marcar como leído / mostrar escritura | `POST /v1/messages/read`, `/v1/messages/typing` |
| Listar/leer conversaciones | `GET /v1/conversations...` |
| Esperar una respuesta urgente | `GET /v1/conversations/{contact}/messages/wait...` |
| Consultar/cancelar un mensaje programado | `GET`, `DELETE /v1/scheduled-messages/{id}` |
| Subir/listar medios reutilizables | `POST /v1/media`, `GET /v1/media?from=...` |
| Listar/sincronizar plantillas | `GET /v1/templates?from=...`, `POST /v1/templates/sync` |
| Administrar Flows | `/v1/flows` |
| Administrar el consentimiento | `/v1/consent` y `/v1/consent/*` |
| Onboarding alojado para clientes | `POST /v1/onboarding/sessions` |
| Gestionar suscripciones de webhooks | `/v1/webhooks`; actualizar sólo eventos con `PATCH /v1/webhooks/{id}` |
| Crear una identidad firmada de Live Chat | `POST /v1/live-chat/identity-tokens` |

La configuración del consentimiento es por WABA. Admite `language: "es" | "en" | "pt-BR"`, títulos y textos editables para opt-in y opt-out, y una nota al pie. Como los Meta Flows son inmutables después de publicarse, guarda el contenido con `PATCH /v1/consent/config` y aplícalo con `POST /v1/consent/enable`; Easyhook crea una versión determinista y los envíos futuros utilizan esa versión. De forma opcional, `auto_opt_in_enabled: true` programa el Flow de opt-in de Easyhook 23 horas después de la primera interacción en vivo. No recrees ese temporizador en un agente o workflow. Easyhook vuelve a validar la ventana de servicio y el estado actual de opt-in/opt-out antes de enviar. `POST /v1/consent` debe incluir evidencia auditable proporcionada por el cliente.

## Inbox, equipos, aplicación móvil y Live Chat

El Inbox web y la aplicación Android de Easyhook utilizan las mismas conversaciones
normalizadas, biblioteca multimedia, estados de entrega, reacciones, respuestas,
plantillas, confirmaciones de lectura, indicadores de escritura, elementos fijados,
estado no leído y registro del wallet que la API pública. Las acciones del proveedor
enviadas desde cualquiera de los dos se cobran al precio normal de la operación;
la navegación, los filtros, la caché local, las actualizaciones en tiempo real y la
entrega de notificaciones no se cobran.

Las organizaciones pueden invitar miembros como `administrator`, `developer` o `agent`.
Los roles se asignan por organización: una persona puede administrar una organización
y actuar como agente en otra. La asignación, presencia, conversaciones de equipo y
atribución de agentes sólo se muestran cuando una organización tiene varios miembros.
La aplicación Android admite propietarios, administradores y agentes; la conexión de
canales y la gestión del wallet, las claves y los webhooks permanecen en el portal web.

Easyhook Live Chat es un canal propio, sin un proveedor externo de mensajería.
Los clientes web utilizan una clave publicable del widget y sesiones de corta duración;
las aplicaciones autenticadas generan tokens de identidad de cinco minutos desde su
propio backend. Nunca incluyas una clave normal de la API de Easyhook en un navegador
o cliente móvil. Live Chat admite conversaciones directas y grupales, texto,
multimedia, stickers, respuestas, metadatos de reenvío, reacciones, ediciones,
marcadores de eliminación, cursores de lectura e indicadores de escritura. Consulta
el contrato completo de sesiones y acciones en la referencia pública de la API.

Para encabezados de plantillas multimedia, sube el ejemplo de aprobación con
`POST /v1/templates/media`. Si proporcionas `template_name`, `template_language` y
`media_type`, se guarda como recurso predeterminado. Al enviar con
`POST /v1/messages/template`, puedes omitir `media` para usar ese recurso o proporcionar
exactamente una referencia dinámica `media.link`, `media.id` o la referencia reutilizable
`media.name`. La referencia dinámica debe coincidir con el encabezado aprobado de imagen,
video o documento; los documentos también pueden establecer `filename`.

Utiliza el endpoint interactivo estandarizado cuando el flujo de trabajo necesite hasta tres
botones de respuesta o URL a través de WhatsApp, Messenger, Instagram o Telegram:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "¿Qué quieres hacer?",
  "buttons": [
    { "type": "reply", "title": "Agendar", "payload": "schedule" },
    { "type": "url", "title": "Cómo llegar", "url": "https://example.com/map" }
  ]
}
```

Envía este cuerpo a `POST /v1/messages/interactive`. WhatsApp acepta hasta tres
respuestas o una URL y no permite mezclar ambos tipos. Las selecciones de respuesta
de los cuatro proveedores utilizan `message.quick_reply.payload`.

Messenger e Instagram también admiten un menú temporal de respuestas rápidas más amplio
a través de `POST /v1/messages/quick-replies`:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "¿Qué necesitas?",
  "quick_replies": [
    { "title": "Ventas", "payload": "sales" },
    { "title": "Soporte", "payload": "support" }
  ]
}
```

Suscríbete a `message.quick_reply` y dirige la acción mediante
`message.quick_reply.payload`. Conserva `message.text` sólo para mostrarlo.

Lee la sección correspondiente en `public-api.md` antes de implementar un endpoint.
Ese documento define todos los parámetros aceptados y los campos mutuamente excluyentes.

Las respuestas al listar, sincronizar y crear plantillas incluyen `meta_waba_id`.
Trátalo como el identificador del WABA en el proveedor; nunca sustituyas el UUID
interno `waba_id` de Easyhook. La creación acepta `parameter_format` como `POSITIONAL` o `NAMED`.
Las integraciones que permiten reintentos seguros deben enviar un `Idempotency-Key` estable.

Para cada operación de plantilla, prefiere `from` como único selector de cuenta.
La clave de API fija la organización y Easyhook obtiene el WABA exacto a partir de
ese teléfono perteneciente al tenant. Si una solicitud incluye `from` y `waba_id`,
ambos deben resolverse al mismo WABA; de lo contrario, Easyhook devuelve
`409 sender_waba_mismatch`. Un `from` desconocido devuelve `404 phone_not_found`
sin recurrir al WABA proporcionado. Nunca reintentes automáticamente ninguno de estos
errores contra un WABA distinto.

## Agentes de voz con ElevenLabs

ElevenLabs es una integración opcional para números de Easyhook con voz. La
organización conecta su propia clave de API en **Portal > Integraciones** y asigna
un agente a las llamadas entrantes. Puede asignar un segundo agente, distinto,
para llamadas salientes: sus instrucciones y primer mensaje normalmente no son
los mismos que los de quien contesta.

Easyhook conserva el número, el enrutamiento, el consentimiento y el cobro. El
audio viaja directamente entre Telnyx y ElevenLabs; n8n puede atender las herramientas
del agente sin entrar en el bucle de audio. Las campañas salientes usan
`POST /v1/calls` con `handler: "ai"` y requieren opt-in de voz explícito para
ese número y contacto. Consulta [Telefonía](/telecom) para el contrato y los
límites.

## Lista de verificación de aceptación

- La clave de API permanece únicamente en el servidor.
- Ningún `tenant_id`, UUID de Supabase, token de acceso de Meta, ID de WABA o ID de teléfono
  está codificado, salvo que el endpoint normativo lo requiera explícitamente.
- Todos los números del remitente y del receptor usan dígitos internacionales.
- Cada escritura reintentable tiene un `Idempotency-Key` estable.
- El HMAC se valida contra los bytes brutos mediante una comparación de tiempo constante.
- El handler devuelve `2xx` antes del trabajo lento de base de datos o automatización.
- Los mensajes y eventos son deduplicados.
- Los envíos programados conservan `scheduled_message.id`, `client_reference` y el
  `message_id` final; la correlación entre webhooks y estados no depende de marcas de tiempo.
- El historial no activa bots destinados a conversaciones en vivo.
- Los eventos de estado fallidos y `sync.failed` se conservan con sus datos de error.
- Meta `status.pricing.billable` describe los precios de Meta, no la facturación de Easyhook.
  Una operación exitosa de la API pública de salida se cobra según el wallet de Easyhook,
  incluso cuando Meta etiqueta la conversación como `free_customer_service`.
- Los logs ocultan claves de API, secretos de webhooks, códigos de autorización y tokens
  de proveedores.
- Las pruebas cubren entrada, salida/eco, multimedia, reacciones, estados fallidos y al
  menos una entrega duplicada.
