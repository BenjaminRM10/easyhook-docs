# Canales

Easyhook reúne WhatsApp, Messenger, Instagram, Telegram, TikTok Business,
correo, Mercado Libre y Google Business Profile bajo una misma
organización, API key, wallet, Inbox y sistema de webhooks. El correo puede
conectarse mediante Gmail, Outlook o IMAP/SMTP. Cada envío usa `from` para
resolver el canal correcto dentro de la organización dueña de la API key.

## TikTok Business

TikTok se conecta con OAuth desde **Conectar > TikTok Business**. Easyhook
solicita únicamente `message.list.read`, `message.list.send` y
`message.list.manage`; no solicita acceso a campañas, anuncios, pixeles,
medición ni CTX.

TikTok no permite que el negocio inicie conversaciones. Después de que un
usuario escribe, el negocio puede enviar hasta 10 respuestas durante las
siguientes 48 horas. Actualmente TikTok no admite Business Accounts registrados
en Estados Unidos, EEE, Suiza o Reino Unido para esta API.

Usa `account.id` del webhook como `from` y conserva exactamente el identificador
opaco de conversación/contacto como `to`. Easyhook estandariza texto,
respuestas, indicador de escritura, leído, botones de respuesta e imágenes.
La media recibida se guarda con una URL privada que requiere la API key para
descargarse.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "tiktok-business-open-id",
    "to": "tiktok-conversation-id",
    "body": "Gracias por escribirnos."
  }'
```

## Google Business Profile

Google Business Profile se conecta con OAuth y cada ubicación elegida aparece
como un canal independiente de reseñas. Desde **Reseñas** puedes consultar la
calificación agregada, leer reseñas y publicar o editar la respuesta pública
del negocio. Consulta la [guía completa](/google-business-profile).

## Mercado Libre

Mercado Libre se conecta con OAuth. Easyhook solicita únicamente acceso de
lectura a la cuenta y acceso de lectura/escritura a comunicaciones pre y
posventa.

1. En Easyhook abre **Conectar > Mercado Libre**.
2. Selecciona el país de la cuenta.
3. Inicia sesión en Mercado Libre y autoriza Easyhook.
4. Al regresar al portal, la cuenta aparece como un canal disponible en Inbox,
   API y Webhooks.

Easyhook recibe preguntas de publicaciones, mensajes posventa iniciados por un
comprador y notificaciones de lectura. No se pueden iniciar conversaciones
arbitrarias. Para responder, usa el destino normalizado incluido en el evento:

- `question:<id>` responde una pregunta.
- `pack:<id>` responde una conversación posventa.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "ml_123456789",
    "to": "question:987654321",
    "body": "Sí, todavía está disponible."
  }'
```

Los mensajes posventa admiten hasta 350 caracteres. Easyhook rota
automáticamente el refresh token y cifra las credenciales. Mercado Libre no
usa la ventana de servicio de 24 horas de WhatsApp. La primera versión del
canal procesa texto; los adjuntos de Mercado Libre todavía no se exponen como
media reutilizable de Easyhook.

### Configuración de la aplicación

Registra estos valores exactos:

- Redirect URI:
  `https://api.easyhook.dev/v1/channels/mercadolibre/oauth/callback`
- Notificaciones callback URL:
  `https://api.easyhook.dev/v1/channels/mercadolibre/webhook`
- Flujos OAuth: **Authorization Code** y **Refresh Token**.
- PKCE: activado.
- Negocio: **Mercado Libre**.
- Usuarios: lectura.
- Comunicaciones pre y post ventas: lectura y escritura.
- Tópicos: `questions`, `messages.created` y `messages.read`.

No habilites Client Credentials, publicaciones, publicidad, facturación,
métricas, promociones, ventas/envíos ni otros tópicos si Easyhook se usará
solamente para mensajería. No marques la app como certificada hasta recibir la
certificación formal de Mercado Libre.

## Comentarios públicos de Meta

Las Pages de Facebook y cuentas profesionales de Instagram pueden recibir
`comment.*`, consultar comentarios por publicación y responder públicamente.
Esta función está separada del Inbox porque un comentario público no es una
conversación privada. Las conexiones existentes deben reautorizarse después de
que Meta conceda `pages_manage_engagement` o `instagram_manage_comments`.

## Telegram

Telegram funciona mediante bots.

1. Abre [@BotFather](https://t.me/BotFather) en Telegram.
2. Crea un bot y copia su token.
3. En Easyhook abre **Conectar > Telegram**.
4. Pega el token y confirma.

Easyhook valida el bot, cifra el token y configura automáticamente el webhook
con un secreto independiente. No debes crear otro webhook en Telegram.

Telegram no tiene una ventana de servicio de 24 horas en Easyhook. El bot puede
responder o enviar mensajes en cualquier momento permitido por Telegram.

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

## Correo

Todos los proveedores de correo usan el mismo endpoint, payload, Inbox y
webhooks. Puedes cambiar de Gmail a Outlook o a un servidor IMAP/SMTP sin
reescribir la integración que envía mensajes.

La ventana de servicio de 24 horas es una política de mensajería de Meta y no
se aplica al correo. Gmail, Outlook e IMAP/SMTP pueden enviar mensajes en
cualquier momento, sujeto únicamente a las políticas y límites del proveedor.

### Gmail

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

Easyhook admite texto, HTML, adjuntos, mensajes nuevos, respuestas en el hilo,
reenvío, leído/no leído, archivado y borradores.

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

Para responder un hilo existente envía `reply_to_message_id` con el
`message.id` del mensaje entrante. Easyhook resuelve el hilo y los encabezados
de Gmail automáticamente. Consulta todos los campos y ejemplos en
[Referencia completa](/api-reference#email-gmail-outlook-and-imapsmtp).

En el Inbox, el icono de filtro aparece al seleccionar una cuenta de correo.
Gmail permite filtrar por categorías, no leídos, destacados e importantes;
Outlook por Prioritarios, Otros y no leídos; IMAP/SMTP por no leídos y
destacados.

Al desconectar Gmail desde **Organización**, Easyhook detiene las
notificaciones de Gmail, revoca la autorización OAuth y elimina la credencial
cifrada.

### Outlook

1. En Easyhook abre **Conectar > Outlook**.
2. Inicia sesión con Microsoft y autoriza el acceso solicitado.
3. Microsoft regresa al portal y la dirección queda disponible como remitente.

Easyhook usa Microsoft Graph para recibir correo nuevo, enviar mensajes y
responder dentro del mensaje original. Las suscripciones de Graph se renuevan
automáticamente. Para una respuesta exacta, envía `reply_to_message_id` con el
`message.id` recibido por webhook o visible en el Inbox.

### IMAP/SMTP

Usa esta opción para proveedores diferentes de Gmail y Outlook.

1. Abre **Conectar > Otro correo (IMAP/SMTP)**.
2. Ingresa la dirección, los servidores IMAP y SMTP, puertos, usuario y
   contraseña de aplicación.
3. Easyhook verifica ambas conexiones antes de guardar el canal.

Easyhook exige TLS o STARTTLS con certificados válidos y bloquea servidores
locales, privados y de metadata. En muchos proveedores debes crear una
contraseña de aplicación; no uses tu contraseña principal cuando el proveedor
ofrezca esa alternativa.

La recepción consulta únicamente mensajes nuevos posteriores a la conexión,
cada minuto. Easyhook no importa automáticamente el buzón anterior. Las
respuestas conservan `Message-ID`, `In-Reply-To` y `References`.

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
específico. Selecciona `telegram`, `gmail`, `outlook`, `imap_smtp`,
`mercadolibre` o `tiktok` y
`message.*` para recibir mensajes nuevos. El JSON mantiene el mismo contrato
normalizado:

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
