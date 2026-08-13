# Chatwoot

La integración conecta canales de Easyhook con bandejas API de Chatwoot. Easyhook se encarga del transporte; Chatwoot conserva contactos, conversaciones, agentes y automatizaciones.

Los canales compatibles son WhatsApp, Messenger, Instagram, Telegram, TikTok
Business, Gmail, Outlook, correo IMAP/SMTP y Mercado Libre. Cada canal seleccionado crea su
propia bandeja para que identidades y conversaciones no se mezclen.

## Requisitos

- Una instalación accesible de Chatwoot.
- Un API Access Token de Chatwoot.
- Al menos un número o canal conectado en Easyhook.

## Configuración

1. En Chatwoot, crea una bandeja de tipo **API**.
2. En Easyhook, abre **Integraciones → Chatwoot**.
3. Ingresa la URL de Chatwoot, Account ID y token.
4. Selecciona uno o varios canales de la organización.
5. Easyhook crea o vincula una bandeja por canal y configura la entrega bidireccional.

Los nombres de bandeja se toman del canal conectado. Puedes renombrarlos después en Chatwoot.

## Comportamiento

- Los mensajes entrantes crean o actualizan contacto y conversación.
- Los mensajes enviados desde WhatsApp Business App mediante Coexistence aparecen como mensajes salientes.
- Los envíos desde Chatwoot pasan por Easyhook y usan el wallet de la organización.
- Texto, imágenes, video, audio, documentos y stickers compatibles se entregan como adjuntos.
- Los estados enviado, entregado y leído se sincronizan cuando Chatwoot permite representarlos.
- Los eventos `typing` se traducen a indicadores de escritura cuando la API de Chatwoot lo permite.
- Las respuestas conservan el contexto nativo necesario: destinatario remoto
  para mensajería, pregunta o pack para Mercado Libre, y mensaje/hilo para
  correo.
- TikTok conserva su conversación opaca, ventana de 48 horas y límite de 10
  respuestas; Chatwoot no puede iniciar una conversación nueva.

## Importar contactos e historial

La importación inicial de esta sección aplica únicamente a contactos e
historial de WhatsApp Coexistence que Easyhook haya recibido de Meta durante el
onboarding. Los demás canales continúan desde los eventos disponibles después
de conectarlos.

- Conserva las fechas originales.
- No vuelve a enviar mensajes a WhatsApp.
- No debe activar bots ni automatizaciones como si fueran mensajes nuevos.
- La importación es idempotente por identificador externo del mensaje.

La sincronización inicial depende de haber autorizado historial en WhatsApp Business App al conectar el número.
