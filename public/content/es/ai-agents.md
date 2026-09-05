# Guía de integración de agentes Easyhook

Última actualización: 2026-08-20

Este archivo es el punto de entrada para un agente de codificación que integra Easyhook en
es intencionalmente conciso. Los contratos normativos son:

1. [Public API](/api-reference): cada punto final del cliente, parámetro de solicitud,
   respuesta, error, regla de facturación, y ejemplo.
2. [Customer Webhooks](/webhooks): API de suscripción, filtros,
   cabeceras de seguridad, nombres de campo JSON normalizados, lotes de historia y retries.

No invente campos de la documentación del proveedor o utilice viejos ejemplos de Easyhook encontrados
Easyhook acepta eventos de proveedores internamente pero expone su propio compacto,
contrato público normalizado.

## Inputs de integración

Obtenga esto del propietario de la organización Easyhook:

```text
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=provider-native account ID or connected WhatsApp number
EASYHOOK_WEBHOOK_URL=https://your-app.example/webhooks/easyhook
```

La clave de API fija la organización. Nunca enviar `tenant_id` a un público
endpoint. `from` debe resolverse a un canal conectado que posea
organización. Preferir el proveedor-nativo `account.id` recibido en Easyhook
webhooks. WhatsApp también acepta su número internacional conectado; no añadir
`page_` o `ig_` prefijos.

`channel` es normalmente opcional. `from` está conectado a más de uno
canal compatible, Easyhook devuelve `409 ambiguous_sender` y listas
`available_channels`; reingresar con el valor previsto, como `whatsapp` o
`sms`. Nunca adivinar o silenciosamente caer de nuevo.

Para WhatsApp, siempre incluye el código internacional de llamadas de país.
acepta valores internacionales, espacios, hyphens, paréntesis, solo dígitos,
y los puntos `00` prefijo internacional. No infiere a un país de
número solo nacional. Mexicano `52`/`521` variantes y móviles argentinos
`54`/`549` la notación se normaliza automáticamente.

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

Use un establo `Idempotency-Key` para cada escritura que la aplicación puede volver a entrar.
No reutilizar la misma clave para dos operaciones lógicas diferentes.

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

Persiste el regreso `scheduled_message.id`. Suscribirse a ambos `scheduled.*`
y `status.*`. `scheduled.sent` proporciona el ID del mensaje del proveedor; el estado del mensaje posterior
de los acontecimientos `scheduled_message_id` y `client_reference`. Reconcile después de un
timeout o webhook outage con:

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Nunca correlacione un mensaje programado por destinatario, nombre de plantilla o timetamp.
`client_reference` acepta a la mayoría de 200 caracteres. Tratar la respuesta HTTP como
el reconocimiento de la programación: una referencia generada localmente sin un retorno
`scheduled_message.id` no prueba que Easyhook recibió la solicitud.

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
| Send Flow | `POST /v1/messages/flow` |
| Mark read / show typing | `POST /v1/messages/read`, `/v1/messages/typing` |
| Lista/conversaciones de lectura | `GET /v1/conversations...` |
| Esperar una respuesta urgente | `GET /v1/conversations/{contact}/messages/wait...` |
| Reconcile/cancel mensaje programado | `GET`, `DELETE /v1/scheduled-messages/{id}` |
| Subir/lista medios reutilizables | `POST /v1/media`, `GET /v1/media?from=...` |
| Plantillas de lista/sincronización | `GET /v1/templates?from=...`, `POST /v1/templates/sync` |
| Manage Flows | `/v1/flows` |
| Administrar el consentimiento | `/v1/consent` y `/v1/consent/*` |

Configuración de consentimiento es por WABA. Soportes de copia `language: "es" | "en" | "pt-BR"`, epígrafes y cuerpos editables opt-in/opt-out, y una calzada. Debido a que Meta Flows son inmutables después de la publicación, guardar copia con `PATCH /v1/consent/config` y aplicarlo con `POST /v1/consent/enable`; Easyhook crea una versión determinista y las rutas futuras envían a ella. `auto_opt_in_enabled: true` Opcionalmente programa Easyhook's opt-in Flow 23 horas después de la primera interacción en vivo. No recrea ese temporizador en un agente o flujo de trabajo. Easyhook revalida la ventana de servicio y el estado actual opt-in/opt-out antes del envío. `POST /v1/consent` debe incluir evidencia auditable suministrada por el cliente.
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

Easyhook Live Chat es un canal de primera persona sin mensajería externa
proveedor. Los clientes navegadores utilizan una clave de widget publicable más de alcance corto
sesiones; aplicaciones autenticadas acuden a fichas de identidad de cinco minutos de sus propias
backend. Nunca incrustar una clave normal de Easyhook API en un navegador o cliente móvil.
Chat en vivo soporta conversaciones directas y colectivas, texto, medios, pegatinas,
respuestas, metadatos de reenvío, reacciones, ediciones, lápidas de eliminación, leídos
Los cursores y la escritura. Vea el contrato completo de sesión y acción en el público
Referencia de API.

Para los encabezados de plantilla multimedia, suba el ejemplo de aprobación con
`POST /v1/templates/media`Suministros `template_name`, `template_language`, y
`media_type` lo almacena como el activo predeterminado. En el tiempo de envío,
`POST /v1/messages/template` Omit `media` utilizar ese predeterminado o proporcionar
exactamente una dinámica `media.link`, `media.id`, o reutilizable `media.name`A
anulación dinámica debe coincidir con el tipo de imagen, vídeo o encabezado de documento aprobado;
documentos medios de comunicación también pueden establecer `filename`.

Utilice el punto final interactivo estandarizado cuando el flujo de trabajo necesita hasta tres
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
Las integraciones seguras de la retry deben enviar un establo `Idempotency-Key`.

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
- No. `tenant_id`, Supabase UUID, Meta access token, WABA ID, o número de teléfono ID
  está codificado a menos que el punto final normativo lo requiera explícitamente.
- Todos los números del remitente y del receptor usan dígitos internacionales.
- Cada escritura retráctil tiene un establo `Idempotency-Key`.
- HMAC se comprueba contra los bytes crudos usando comparación de tiempo constante.
- Handler devuelve `2xx` antes de la lenta base de datos / trabajo de automatización.
- Los mensajes y eventos son deduplicados.
- Los envíos programados persisten `scheduled_message.id`, `client_reference`, y
  final `message_id`; correlación webhook/status no depende de las marcas temporales.
- La historia no desencadena bots en vivo.
- Failed status events and `sync.failed` son retenidos con sus datos de error.
- Meta `status.pricing.billable` describe Meta pricing, no Easyhook billing.
  Una operación de API de salida pública exitosa se carga de acuerdo con
  Cartera Easyhook incluso cuando Meta etiqueta la conversación `free_customer_service`.
- Logs redact API keys, webhook secrets, códigos de autorización y proveedor
  Tokens.
- Los exámenes cubren la entrada, salida/echo, medios de comunicación, reacción, estado fallido, y en
  menos una entrega duplicada.
