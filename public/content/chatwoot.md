# Chatwoot

La integración conecta canales de Easyhook con bandejas API de Chatwoot. Easyhook se encarga del transporte; Chatwoot conserva contactos, conversaciones, agentes y automatizaciones.

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

## Importar contactos e historial

La integración puede importar los contactos y mensajes históricos que Easyhook haya recibido de Meta durante el onboarding de Coexistence.

- Conserva las fechas originales.
- No vuelve a enviar mensajes a WhatsApp.
- No debe activar bots ni automatizaciones como si fueran mensajes nuevos.
- La importación es idempotente por identificador externo del mensaje.

La sincronización inicial depende de haber autorizado historial en WhatsApp Business App al conectar el número.
