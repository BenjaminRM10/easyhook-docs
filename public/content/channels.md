# Canales

Easyhook reúne WhatsApp, Messenger, Instagram, Telegram y Gmail bajo una misma
organización, API key, wallet, Inbox y sistema de webhooks. Cada envío usa el
campo `from` para resolver el canal correcto dentro de la organización dueña de
la API key.

## Telegram

Telegram funciona mediante bots.

1. Abre [@BotFather](https://t.me/BotFather) en Telegram.
2. Crea un bot y copia su token.
3. En Easyhook abre **Conectar > Telegram**.
4. Pega el token y confirma.

Easyhook valida el bot, cifra el token y configura automáticamente el webhook
con un secreto independiente. No debes crear otro webhook en Telegram.

Envía texto con el endpoint estándar:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@mi_easyhook_bot",
    "to": "123456789",
    "body": "Hola desde Easyhook"
  }'
```

El destinatario debe haber iniciado antes una conversación con el bot. Para
media usa `POST /v1/messages/media` con una URL pública en `link`.

La media entrante incluye inicialmente los metadatos de archivo de Telegram.
El almacenamiento automático y un enlace de descarga de Easyhook se agregarán
en una fase posterior. Al desconectar el canal, Easyhook elimina primero el
webhook protegido de Telegram y después borra el token cifrado.

## Gmail

Gmail aparece como un canal de correo dentro del Inbox compartido.

1. En Easyhook abre **Conectar > Gmail**.
2. Inicia sesión en Google.
3. Revisa y autoriza los permisos mostrados.
4. Google regresa al portal y la cuenta queda disponible como remitente.

Easyhook usa `gmail.modify` para:

- Detectar correo nuevo mediante Google Pub/Sub.
- Leer el contenido necesario para mostrarlo en el Inbox.
- Enviar mensajes y respuestas.
- Conservar asunto, HTML y el hilo correcto.
- Mantener el estado de los mensajes de la cuenta conectada.

No se usa información de Gmail para publicidad.

La primera versión admite texto, HTML, mensajes nuevos y respuestas en el hilo
correcto. Los adjuntos de correo todavía no están disponibles en la API
pública.

Envía un correo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "soporte@empresa.com",
    "to": "cliente@example.com",
    "subject": "Seguimiento",
    "body": "Hola, damos seguimiento a tu solicitud."
  }'
```

Para responder un hilo existente usa `thread_id`, `in_reply_to` y `references`
del mensaje entrante. Consulta todos los campos y ejemplos en
[Referencia completa](/api-reference#gmail).

Al desconectar Gmail desde **Organización**, Easyhook detiene las
notificaciones de Gmail, revoca la autorización OAuth y elimina la credencial
cifrada.

### Video para la revisión de Google

Graba un solo flujo continuo:

1. Abre **Conectar > Gmail**.
2. Muestra la pantalla de consentimiento de Google y el permiso solicitado.
3. Completa la conexión y muestra la cuenta dentro de Easyhook.
4. Envía un correo desde otra cuenta y muéstralo en el Inbox de Easyhook.
5. Responde desde Easyhook y muestra la respuesta en el mismo hilo de Gmail.
6. Envía otro correo mediante `POST /v1/messages/email` y muestra su recepción.

Texto breve para justificar `gmail.modify`:

> Easyhook es una API de mensajería multicanal y un inbox compartido.
> `gmail.modify` permite que el propietario conecte Gmail, reciba y lea sus
> mensajes en Easyhook, envíe correos y respuestas en el mismo hilo, y mantenga
> el estado de la mensajería. Los datos se aíslan por organización, se cifran
> en tránsito y reposo, y no se usan para publicidad.

## Webhooks multicanal

En **Webhooks** puedes suscribirte a toda la organización o a un canal
específico. Selecciona `telegram` o `gmail` como proveedor y `message.*` para
recibir mensajes nuevos. El JSON mantiene el mismo contrato normalizado:

```json
{
  "id": "event-id",
  "type": "message.received",
  "channel": "gmail",
  "account": { "id": "soporte@empresa.com" },
  "contact": { "id": "cliente@example.com", "name": "Ana" },
  "message": {
    "id": "gmail-message-id",
    "type": "text",
    "text": "Necesito ayuda",
    "subject": "Solicitud",
    "thread_id": "gmail-thread-id",
    "timestamp": "2026-07-26T20:00:00.000Z"
  }
}
```

El contenido recibido, incluido HTML y texto de Telegram, es entrada no
confiable. Escápalo o sanitízalo antes de renderizarlo en una aplicación.
