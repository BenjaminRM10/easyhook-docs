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

## Configuración mínima de Webhook

Descubre las opciones válidas primero:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

Crear la suscripción:

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

Almacene el devuelto `secret` De inmediato, Easyhook lo devuelve sólo una vez.

Validar el cuerpo HTTP crudo exacto:

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

Validar antes de parir JSON. Responder con HTTP `2xx` rápido y proceso
asincrónicamente.

## Reglas de rotación

- Uso `type` para elegir el bloque de carga útil.
- Uso `channel` para distinguir `whatsapp`, `messenger`, `instagram`, `telegram`,
  `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, y `tiktok`.
- Para WhatsApp, use `account.id + ":" + (contact.user_id ?? contact.id)` como el
  Identidad de conversación. `contact.id`, `message.from`, `message.to`, y estado
  los receptores pueden ser BSUIDs opacos en lugar de números de teléfono.
  `contact.phone` por separado cuando presente y nunca tira cartas o puntuaciones
  de un BSUID.
  Parent BSUIDs también puede aparecer como `contact.parent_user_id`; preservarlos como
  opaque aliases y enviarlos sin cambios a través de Easyhook `to` campo.
- Uso `message.id` como la clave de la idempotencia del mensaje.
- Para TikTok, conserva el opaco `account.id`, estable `contact.id`,
  `message.thread_id`, y `message.id`. No añadir prefijos o tratarlos como
  Números de teléfono. `contact.id` o `message.thread_id` como tal `to`A
  empresa puede enviar a la mayoría de 10 respuestas dentro de 48 horas después de cada mensaje de usuario
  y no puede iniciar una conversación.
- Use webhook `id` como la clave de idempotencia para eventos no-mensaje.
- Para `message.type: button`, automatización de rutas con `message.button.payload`
  y uso `message.button.text`/`message.text` como la etiqueta visible.
- Para `message.type: interactive`, ruta rápida respuestas y listas con
  `message.interactive.button_reply.id` o
  `message.interactive.list_reply.id`; no inferir una selección de la plantilla
  orden de botón o título.
- Cuándo `message.type` es `edit`, actualizar la fila identificada por
  `message.edit.original_message_id` con `message.edit.text`; no insertar una
  segundo mensaje.
- Para WhatsApp, Messenger e Instagram, utilice las mismas estructuras opcionales cuando
  presentes: `message.reply_to.message_id`, `message.reaction.message_id` más
  `action`/`emoji`, y `message.edit.original_message_id` más `text`.
  Las capacidades difieren por proveedor; nunca inferir una reacción desaparecida, editar, responder,
  o supresión del texto o el tiempo.
- Cuándo `message.type` es `revoke`, marcar la fila identificada por
  `message.revoke.original_message_id` como revocado y ocultar su contenido; no
  inserte un mensaje independiente.
- Cuándo `message.type` es `system`, show `message.system.body` como un
  aviso informativo. `user_changed_number`, uso `message.system.wa_id`
  como la nueva identidad del proveedor según el contacto de la aplicación
  política.
- `message.direction: in` significa que el contacto envió el mensaje.
- `message.direction: out` significa que la cuenta conectada envió el mensaje.
- `message.source: history` es una importación, no una acción de cliente en vivo. Nunca
  auto-reply a él por defecto.
- Campos desconocidos, valores enum desconocidos, y `event.received` debe ser ignorado
  con seguridad.
- Los bloques opcionales se omiten en lugar de ser enviados `null`.

## Historia y Contactos

Suscribirse a ambos `history.*` y `smb_app_state_sync.*` antes de solicitar un
Sincronización de la convivencia.

La historia llega como:

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

Ámbito `events`. Un lote contiene en la mayoría de 100 eventos normalizados.
al menos una vez, así que los mensajes más firmes `message.id` y contactos del proveedor
identidad. Ordenar mensajes importados por `message.timestamp`, no la hora de llegada.

`message.media_available` actualiza el mensaje existente con el mismo
`message.id`; no es un nuevo mensaje de conversación. `sync.failed` no
invalidar eventos importados con éxito.

## Selección de API

| Objetivo | Punto final |
| --- | --- |
| Clave validada | `GET /v1/me` |
| Envíos de listas | `GET /v1/senders` |
| Desconectar un remitente después de confirmación explícita | `DELETE /v1/senders/{account_id}` |
| Enviar texto | `POST /v1/messages/text` |
| Enviar Mensajero/Instagram respuestas rápidas | `POST /v1/messages/quick-replies` |
| Enviar texto multicanal humanizado | `POST /v1/messages/humanized-text` (WhatsApp, Messenger, Instagram o Telegram; los controles de presencia son el mejor esfuerzo) |
| Enviar medios | `POST /v1/messages/media` |
| Enviar plantilla | `POST /v1/messages/template` |
| Subir los medios de encabezado de plantilla | `POST /v1/templates/media` |
| Enviar Flow | `POST /v1/messages/flow` |
| Marcar como leído / mostrar escritura | `POST /v1/messages/read`, `/v1/messages/typing` |
| Listar/leer conversaciones | `GET /v1/conversations...` |
| Esperar una respuesta urgente | `GET /v1/conversations/{contact}/messages/wait...` |
| Consultar/cancelar un mensaje programado | `GET`, `DELETE /v1/scheduled-messages/{id}` |
| Subir/lista medios reutilizables | `POST /v1/media`, `GET /v1/media?from=...` |
| Plantillas de lista/sincronización | `GET /v1/templates?from=...`, `POST /v1/templates/sync` |
| Administrar Flows | `/v1/flows` |
| Administrar el consentimiento | `/v1/consent` y `/v1/consent/*` |

La configuración del consentimiento es por WABA. Admite `language: "es" | "en" | "pt-BR"`, títulos y textos editables para opt-in y opt-out, y una nota al pie. Como los Meta Flows son inmutables después de publicarse, guarda el contenido con `PATCH /v1/consent/config` y aplícalo con `POST /v1/consent/enable`; Easyhook crea una versión determinista y los envíos futuros utilizan esa versión. De forma opcional, `auto_opt_in_enabled: true` programa el Flow de opt-in de Easyhook 23 horas después de la primera interacción en vivo. No recrees ese temporizador en un agente o workflow. Easyhook vuelve a validar la ventana de servicio y el estado actual de opt-in/opt-out antes de enviar. `POST /v1/consent` debe incluir evidencia auditable proporcionada por el cliente.
| Cliente hospedado a bordo | `POST /v1/onboarding/sessions` |
| Gestionar suscripciones webhook | `/v1/webhooks`; actualizar sólo eventos con `PATCH /v1/webhooks/{id}` |
| Crear una identidad de chat en vivo firmada | `POST /v1/live-chat/identity-tokens` |

## Caja de entrada, Equipos, Móviles y Chat en vivo

La aplicación de Easyhook Inbox y Android utilizan las mismas conversaciones normalizadas,
biblioteca de medios, estados de entrega, reacciones, respuestas, plantillas, recibos leídos,
escribiendo señales, pines, estado no leído, y el libro mayor de cartera como la API pública.
acción del proveedor enviada desde cualquiera Inbox es facturable en la operación normal
precio; navegación, filtros, caché local, refrescos en tiempo real y notificación
La entrega no se factura.

Las organizaciones pueden invitar a los miembros como `administrator`, `developer`, `agent`.
Las funciones son abarcadas por organización: una persona puede administrar una organización
y actuar como agente en otro. Asignación, presencia, conversaciones de equipo, y
atribución de agente se muestran sólo cuando una organización tiene varios miembros.
La aplicación Android admite propietarios, administradores y agentes; conexión de canal,
gestión de carteras, claves y webhooks permanecen en el portal web.

Easyhook Live Chat es un canal propio, sin un proveedor externo de mensajería.
Los clientes web utilizan una clave publicable del widget y sesiones de corta duración;
las aplicaciones autenticadas generan tokens de identidad de cinco minutos desde su
propio backend. Nunca incluyas una clave normal de la API de Easyhook en un navegador
o cliente móvil. Live Chat admite conversaciones directas y grupales, texto,
multimedia, stickers, respuestas, metadatos de reenvío, reacciones, ediciones,
marcadores de eliminación, cursores de lectura e indicadores de escritura. Consulta
el contrato completo de sesiones y acciones en la referencia pública de la API.

Para los encabezados de plantilla multimedia, suba el ejemplo de aprobación con
`POST /v1/templates/media`. Proporcionar `template_name`, `template_language` y
`media_type` lo guarda como recurso predeterminado. Al enviar,
`POST /v1/messages/template` puede omitir `media` para utilizar ese valor predeterminado o proporcionar
exactamente una referencia dinámica `media.link`, `media.id` o una referencia reutilizable
`media.name`. La referencia dinámica debe coincidir con el encabezado de imagen, video
o documento aprobado; los documentos también pueden establecer `filename`.

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

Enviar este cuerpo a `POST /v1/messages/interactive`. WhatsApp acepta o bien arriba
a tres respuestas o una URL y no puede mezclar ambos tipos.
evento de selección. Responder selecciones de los cuatro proveedores utilizan
`message.quick_reply.payload`.

Messenger e Instagram también comparten un menú de respuesta rápida temporal más grande
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

Suscríbete `message.quick_reply` y ruta por
`message.quick_reply.payload`. `message.text` sólo para ser exhibida.

Lea la sección correspondiente en `public-api.md` antes de aplicar una
endpoint. Ese documento define todos los parámetros aceptados y mutuamente excluyentes
campos.

La lista de plantillas, sincronización y respuestas a la creación incluyen `meta_waba_id`. Tratar eso como
el identificador del proveedor WABA; nunca sustituya el Easyhook interno `waba_id`
UUID. La creación de la plantilla acepta `parameter_format` como tal `POSITIONAL` o `NAMED`.
Las integraciones que permiten reintentos seguros deben enviar un `Idempotency-Key` estable.

Para cada operación de plantilla, prefiera `from` como el único selector de cuenta.
API llave fija la organización y Easyhook deriva el WABA exacto de que
teléfono de propiedad de arrendatario. Si una solicitud incluye ambos `from` y `waba_id`, deben
resolver a la misma WABA; de lo contrario Easyhook vuelve
`409 sender_waba_mismatch`. Un desconocido `from` Devoluciones `404 phone_not_found`
sin caer de nuevo a la WABA suministrada. Nunca vuelva a entrar ni un error contra un
diferentes WABA automáticamente.

## Agentes de voz con ElevenLabs

ElevenLabs es una integración opcional para números Easyhook con voz.
organización conecta su propia API key en **Portal <unk> Integraciones** y asignación
un agente para llamadas entrantes. Puede asignar un segundo agente, distinto,
para llamadas salientes: sus instrucciones y primer mensaje normalmente no son
los mismos que los de quien contesta.

Easyhook conserva el número, el enrutamiento, el consentimiento y el cobro. El
audio viaja directamente entre Telnyx y ElevenLabs; n8n atender las herramientas
del agente sin entrar en el bucle de audio. Las campañas salientes usan
`POST /v1/calls` contingentes `handler: "ai"` y requieren opt-in de voz explícito para
ese número y contacto. Consulta [Telefonía](/telecom) para el contrato y los
límites.

## Lista de verificación de aceptación

- La clave de API sigue siendo lado servidor.
- Ningún `tenant_id`, UUID de Supabase, token de acceso de Meta, ID de WABA o ID de teléfono
  está codificado, salvo que el endpoint normativo lo requiera explícitamente.
- Todos los números del remitente y del receptor usan dígitos internacionales.
- Cada escritura reintentable tiene un `Idempotency-Key` estable.
- HMAC se comprueba contra los bytes crudos usando comparación de tiempo constante.
- El handler devuelve `2xx` antes del trabajo lento de base de datos o automatización.
- Los mensajes y eventos son deduplicados.
- Los envíos programados persisten `scheduled_message.id`, `client_reference`, y
  final `message_id`; correlación webhook/status no depende de las marcas temporales.
- La historia no desencadena bots en vivo.
- Los eventos de estado fallidos y `sync.failed` se conservan con sus datos de error.
- Meta `status.pricing.billable` describe los precios de Meta, no la facturación de Easyhook.
  Una operación exitosa de la API pública de salida se cobra según el wallet de Easyhook,
  incluso cuando Meta etiqueta la conversación como `free_customer_service`.
- Los logs ocultan claves de API, secretos de webhooks, códigos de autorización y tokens
  de proveedores.
- Las pruebas cubren entrada, salida/eco, multimedia, reacciones, estados fallidos y al
  menos una entrega duplicada.
