# Easyhook Live Chat

Live Chat es un canal operado directamente por Easyhook. Permite instalar un
chat en un sitio o usar Easyhook como servidor de conversaciones directas y de
grupo sin desplegar un backend de mensajería propio.

## Dos formas de usarlo

1. **Widget para visitantes:** crea un widget en el portal, registra orígenes
   HTTPS exactos y publica la clave `eh_chat_pk_...` en el frontend.
2. **Usuarios autenticados de una app:** tu backend crea una identidad firmada
   de cinco minutos con `POST /v1/live-chat/identity-tokens`. El cliente recibe
   una sesión limitada a su identidad y sus conversaciones.

Nunca coloques una API key normal de Easyhook ni credenciales de Supabase en el
navegador. La clave publicable identifica un widget, pero no concede acceso a la
organización.

## Capacidades

Live Chat soporta texto, imágenes, video, audio, documentos, stickers, replies,
reenvíos, reacciones, edits, tombstones de eliminación, read cursors y typing.
También soporta conversaciones directas y grupos. Los mensajes aparecen como
`channel: "live_chat"` en el Inbox multicanal y en webhooks normalizados.

Las sesiones tienen access tokens breves y refresh tokens rotatorios de un solo
uso. El servidor valida origen, membresía y acción en cada llamada. Turnstile,
límites independientes e identidades generadas por Easyhook protegen el
bootstrap anónimo.

## Facturación

Los mensajes y acciones durables consumen wallet con idempotencia. Las lecturas,
estado y polling no se cobran, por lo que un reconnect o refresh no duplica
cargos. Consulta los payloads y errores exactos en la
[referencia completa de la API](/api-reference#easyhook-live-chat).
