# Easyhook Public API

Última actualización: 2026-08-27

Este documento es la fuente de la verdad para el comportamiento de API orientado al cliente. Cada cambio de API debe actualizar este archivo en el mismo conjunto de cambios.

## Telecom

El contrato para números, SMS/MMS y llamadas es independiente del proveedor. Consulta [Telefonía](/telecom) para conocer las capacidades, los esquemas, la seguridad y el ciclo de facturación.

- `GET /v1/telecom/capabilities`
- `GET /v1/telecom/numbers`
- `GET /v1/telecom/numbers/available`
- `POST /v1/telecom/numbers/orders`
- `POST /v1/messages/text` con `channel: "sms"` cuando sea necesario
- `POST /v1/calls`
- `POST /v1/consent` con `channel: "voice"` para registrar el opt-in/opt-out para la extensión de IA
- `GET /v1/calls/{callId}`
- `POST /v1/calls/{callId}/actions/hangup`

El callback transportista es una infraestructura privada y no es un punto final optimizado para el cliente.

Regreso de SMS y MMS `maximum_reserved_cost` en lugar de un precio final citado.
La retención se reduce a la tarifa final Easyhook después de que el transportista confirme
la cantidad facturable, y la porción no utilizada es devuelta.
reservado y asentado de la firma `message.received` El portaaviones de callback
costo porque no hay solicitud previa del cliente y no más tarde entrada
`message.finalized` evento.

La voz del transportista de entrada se reserva un máximo reembolsable de 60 minutos antes
Anillo de un punto final de Easyhook. La carga final utiliza la firma `call.cost`
`total_cost` y duración facturada, aplica la tarifa actual de voz Easyhook,
y devuelve la retención sin usar.

`POST /v1/calls` también acepta `handler: "ai"` para llamadas telefónicas salientes.
utiliza el agente de ElevenLabs fuera de línea explícitamente ligado al número de Easyhook
(que también puede ser su agente entrante), puentes sólo después
el destino responde, y acepta un escalar atado `context` objeto para
variables per-call. La extensión AI requiere un consentimiento explícito de voz grabado a través de
`POST /v1/consent` y se ha acelerado a un intento por hora y tres por
24 horas por organización/número/contacto.
`202` sin un token WebRTC; los medios fluyen directamente entre Telnyx y
Once laboratorios.

El manejador de ElevenLabs gestionado actualmente soporta `channel: "phone"` Sólo.
Human WebRTC llama soporte ambos `phone` y `whatsapp`. Una solicitud que combina
`handler: "ai"` con `channel: "whatsapp"` falla explícitamente con
`voice_ai_phone_channel_required`; Easyhook no cambia el Meta de un organización
número de la señalización Graph/WebRTC a SIP detrás de su espalda.

## Base URL

URL de la API de producción:

```text
https://api.easyhook.dev
```

## Autenticación

Las llamadas de API de cliente usan una clave de API de organización/tenant en la `Authorization` Cabeza.

```http
Authorization: Bearer eh_live_xxx
```

### Aislamiento de las organizaciones

Una clave de API pertenece exactamente a una organización Easyhook.
siempre derivado de la clave; las solicitudes de API de cliente no deben enviar `tenant_id`.

Los selectores de recursos se resuelven sólo dentro de esa organización:

- `from` acepta un número de remitente de propiedad o identificador de canal conectado.
- `phone_id` acepta un teléfono de Easyhook propiedad UUID.
- `waba_id` acepta un ID de Easyhook WABA UUID o Meta WABA.
- Cuando se suministra más de un selector, cada selector debe resolverse al
  el mismo recurso.
- Easyhook nunca vuelve a otro teléfono o WABA cuando un selector no puede ser
  resuelto.
- `channel` es opcional cuando `from` Identifica exactamente un remitente compatible.
  Cuando el mismo valor pertenece a más de un canal, Easyhook vuelve
  `409 ambiguous_sender` con `available_channels`; retratar con un explícito
  `channel` en lugar de adivinar.

Errores de aislamiento previstos:

| HTTP | Error | Significado |
| --- | --- | --- |
| `400` | `tenant_id_not_allowed` | La solicitud del cliente trató de anular la organización de la clave API. |
| `400` | `invalid_from` | El remitente no es un identificador compatible válido. |
| `404` | `phone_not_found` | El remitente falta de esta organización, incluso cuando pertenece a otra organización. |
| `404` | `waba_not_found` | El WABA está desaparecido de esta organización, incluso cuando pertenece a otra organización. |
| `409` | `sender_phone_mismatch` | `from` y `phone_id` Identificar diferentes teléfonos de propiedad. |
| `409` | `sender_waba_mismatch` | El remitente seleccionado no pertenece al WABA suministrado. |
| `409` | `ambiguous_sender` | Lo mismo `from` está conectado a múltiples canales compatibles; enviar `channel`. |

Estas reglas se aplican a los mensajes, medios, plantillas, flujos, consentimiento, lectura/tipificación
acciones, programación, conversaciones, webhooks y activos reutilizables.

## MCP For AI Agents

Easyhook proporciona un servidor de protocolo modelo independiente para Codex, Claude y otros clientes de MCP:

```text
easyhook-mcp-server
```

El servidor no expone la clave o el remitente de API como argumentos de herramienta. Se fijan en el entorno de proceso MCP, y cada destino leído o outbound se revisa contra una lista de contactos requerida antes de hacer una solicitud de Easyhook API. Cada contacto incluye un nombre y descripción para que el agente sepa quién puede contactar y cuándo.

Instala en Codex:

```bash
codex mcp add easyhook \
  --env EASYHOOK_API_KEY=eh_live_xxx \
  --env EASYHOOK_FROM=15550100002 \
  --env EASYHOOK_CONTACTS='[{"phone":"15550100003","name":"QA Contact","description":"QA contact; use only for requested tests"}]' \
  -- npx -y easyhook-mcp-server
```

Equivalente `~/.codex/config.toml` configuración:

```toml
[mcp_servers.easyhook]
command = "npx"
args = ["-y", "easyhook-mcp-server"]
startup_timeout_sec = 90

[mcp_servers.easyhook.env]
EASYHOOK_API_KEY = "eh_live_xxx"
EASYHOOK_FROM = "15550100002"
EASYHOOK_CONTACTS = "[{\"phone\":\"15550100003\",\"name\":\"QA Contact\",\"description\":\"QA contact; use only for requested tests\"}]"
```

Herramientas MCP disponibles:

| Herramienta | Propósito |
| --- | --- |
| `list_contacts` | Lista de contactos permitidos con sus nombres y descripciones de uso. |
| `send_text` | Enviar texto estándar, humanizado o programado. |
| `send_media` | Enviar medios por nombre reutilizable, Meta media id o URL pública. |
| `send_template` | Enviar una plantilla de WhatsApp aprobada. |
| `send_flow` | Envíe un flujo de WhatsApp publicado. |
| `send_consent_flow` | Envíe el WABA opt-in o opt-out Flow. |
| `list_templates` | Lista de plantillas resueltas desde el remitente configurado. |
| `list_media` | Lista de medios reutilizables resueltos desde el remitente configurado. |
| `list_flows` | Lista Flujos resueltos desde el remitente configurado. |
| `list_conversations` | Listar conversaciones recientes para el remitente configurado, filtradas para contactos configurados. |
| `get_recent_messages` | Lea mensajes de entrada y salida con un contacto permitido. |
| `wait_for_message` | Espere hasta cinco minutos para el siguiente mensaje de entrada de un contacto permitido. |

`EASYHOOK_CONTACTS` es un array JSON `{ phone, name, description }`. Enviar y leer herramientas aceptan el nombre o el teléfono configurados. Los teléfonos con formato se normalizan a dígitos. `EASYHOOK_ALLOWED_TO` la lista separada por coma sigue siendo apoyada cuando `EASYHOOK_CONTACTS` La clave de API y el remitente nunca se convierten en argumentos de herramientas. La billetera Easyhook, ventanilla de servicio, consentimiento, plantilla y Meta aún se aplican controles de política.

`list_conversations` y `get_recent_messages` utiliza las lecturas de API de clientes facturables.
`wait_for_message` un tiempo de espera es un resultado normal y no debe
ser interpretado como permiso para que un agente continúe indefinidamente.

Hosted onboarding soporta WhatsApp, Messenger, Instagram, Telegram, TikTok,
Gmail, Outlook, Mercado Libre y correo electrónico personalizado cuando sea aplicable. Desconectar un remitente no está expuesto intencionalmente como
una herramienta MCP porque es una acción destructiva de organización-administración.
operación organización-scopio REST `DELETE /v1/senders/{account_id}` de un aprobado
flujo de gestión.

## Chatwoot

Easyhook se puede utilizar como el transporte para una caja de entrada de la API de Chatwoot.
el sistema de registro para agentes, equipos, contactos, asignaciones, etiquetas, notas,
automatización y estado de conversación. Easyhook solo recibe eventos y eventos de proveedores
envía respuestas de agente.

### Configuración

1. En Chatwoot, abrir **Configuración de archivos <unk> Access Token** y copiar una API de usuario
   token con acceso a la cuenta de destino.
2. Copiar el ID de cuenta numérico de una URL de Chatwoot, como
   `/app/accounts/7/...`.
3. En Easyhook, abierto **Integraciones <unk> Chatwoot**.
4. Introduzca la URL de Chatwoot, ID de cuenta y token de API, a continuación, seleccione uno, varios,
   o todos los canales de Easyhook disponibles.
5. Easyhook crea una caja independiente de API de Chatwoot por canal seleccionado,
   utiliza el nombre de la pantalla del canal como el nombre de la caja, y asigna al proveedor
   avatar.
6. En Chatwoot, abre las nuevas bandejas, agrega los agentes que pueden usarlas, y
   opcionalmente renombrarlos.

Ambos Chatwoot Cloud (`https://app.chatwoot.com`) e instalaciones auto hospedadas
con una URL HTTPS pública son compatibles. No crear la API Inbox manualmente y
no copiar su URL Webhook, ID de la caja, identificador de la bandeja de entrada o Webhook Secret en
Easyhook. Easyhook crea la API Inbox con su URL de callback y su propio
la URL de callback contiene una suscripción de evento configurada.
secreto aleatorio y el token Chatwoot se almacena en el organización encriptado de Easyhook
tienda secreta. Si una caja de entrada conectada existente no tiene avatar, Easyhook asigna
el proveedor correspondiente avatar la próxima vez que se cargan sus integraciones.
Chatwoot todavía muestra su icono estándar de canal API en la barra lateral; Chatwoot
Cloud no expone un ajuste de API para reemplazar ese pequeño icono de tipo canal.

La provisión Chatwoot admite WhatsApp, Messenger, Instagram, Telegram,
Gmail, Outlook, cuentas genéricas IMAP/SMTP, y Mercado Libre.
el remitente recibe su propia bandeja de entrada Chatwoot para que los contactos y conversaciones no puedan
cruce los límites del canal.

### Comportamiento

- Live inbound text and media create or reuse a Chatwoot contact and
  conversación.
- Los mensajes de agentes salientes públicos se envían a través de Easyhook conectado
  remitente.
- Gmail, Outlook y respuestas IMAP/SMTP conservan el tema original y
  hilo de proveedor siempre que ese contexto esté disponible.
  privadamente de Chatwoot, validado, y enviado a través del buzón de correo conectado.
- Las respuestas de telegrama se envían a través del bot seleccionado.
  seguir la pregunta o la conversación post-purchase representada por la
  Identificador de contacto Easyhook.
- Estados de entrega de WhatsApp (`sent`, `delivered`, `read`, y `failed`) actualización
  el mensaje saliente correspondiente en Chatwoot. La correlación del estado comienza
  con mensajes enviados después de la versión de integración que almacena al proveedor
  ID de mensaje.
- Mientras que un agente tipo en Chatwoot, Easyhook envía el indicador de clasificación de WhatsApp
  para el último mensaje de entrada en esa conversación. Se detiene automáticamente
  cuando se envía la respuesta o cuando el indicador de Meta expira.
- WhatsApp no proporciona un Webhook de diseño de clientes. Chatwoot por lo tanto
  no puede mostrar una animación real "customer está escribiendo" para contactos de WhatsApp.
- Notas privadas, ecos entrantes Chatwoot webhook, y conversaciones pertenecientes
  a otras cajas son ignoradas.
- El tráfico de proveedores entrantes es gratuito. Los mensajes enviados por un agente se cargan como
  operaciones normales de salida Easyhook.
- Las respuestas de forma gratuita de WhatsApp todavía requieren una ventana de servicio al cliente abierta.
  Fuera de esa ventana, envía una plantilla aprobada a través de Easyhook.
- El correo electrónico y Telegram no utilizan la ventana de servicio al cliente de WhatsApp las 24 horas.
  Las políticas de entrega específicas de los proveedores y anti-spam todavía se aplican.
- Los contactos y la historia de la coexistencia sólo se importan cuando una organización
  administrador los solicita de **Integraciones <unk> Chatwoot**.
- La entrega es idempotente por el ID de evento Easyhook y el ID de mensaje Chatwoot. Webhook
  los registros no crean un segundo mensaje Chatwoot.
- Las entregas en vivo utilizan una caja de salida persistente con retries automáticos.
  Chatwoot o fallo de red no descarta el evento del proveedor.
- Easyhook descarga medios protegidos dentro del límite de organización y sube
  el archivo a Chatwoot server-to-server. Los medios almacenados nunca se hace público para
  Chatwoot para recuperarlo.

Desconectar despeja el callback de API Inbox, elimina el evento Easyhook
suscripción y elimina la asignación Easyhook-to-Chatwoot. No elimina
la bandeja de entrada Chatwoot, contactos o conversaciones.

### Importación de contactos e historia

Cada caja de entrada de WhatsApp conectado tiene contactos independientes **Import** y **Import
historia** acciones. Los contactos están aumentados en Chatwoot por su estable Easyhook
Identificador. La historia solo está disponible para la coexistencia de App Business
números cuyo propietario autorizó el intercambio de historia durante el a bordo y cuyo
La historia normalizada todavía está disponible en Easyhook.

La importación de historia tiene estas garantías:

- Easyhook reutiliza los datos de historia normalizada y estado de aplicación duraderos.
  El teléfono no tiene que ser reconectado.
- Los eventos se reproducen en lotes de los más de 100 y se procesan asincrónicamente.
  El portal muestra un progreso independiente para contactos y mensajes.
- Los lotes se procesan secuencialmente por importación.
  y las respuestas de los límites de tarifas se retratan, por lo que un libro de direcciones grande no
  abruma a Chatwoot.
- Los mensajes son idempotente por su ID original del mensaje Meta.
  la importación no crea otra copia.
- El tiempo de mensaje original es enviado a Chatwoot como
  `external_created_at` y retenidos en
  `content_attributes.external_created_at`. Chatwoot Cloud todavía puede renderizar
  la burbuja con su tiempo de importación interno porque su API pública no
  permiso Easyhook para sobreescribir la base de datos `created_at` valor.
- Quedan resueltas nuevas conversaciones creadas por la importación.
  Los mensajes contienen `content_attributes.easyhook_history: true`.
- Easyhook suprime la entrega saliente de esa caja de entrada Chatwoot mientras que una
  la importación es activa. Esto evita bots de agente y automatizaciones evaluadas por
  Chatwoot de enviar respuestas históricas a WhatsApp. También temporalmente
  bloquea las respuestas legítimas del agente de la bandeja de entrada hasta que la importación termine.
- Si los medios históricos todavía son descargables, Easyhook lo adjunta. Si Meta o
  Easyhook ya no tiene el archivo, el mensaje de texto y los tiempos originales son
  importado sin el apego en lugar de dejar caer el mensaje.

La API pública de Chatwoot no expone una bandera universal que deshabilita todos
evaluación de automatización interna durante la creación de mensajes.
garantiza la supresión del transporte, no que una automatización Chatwoot produzca
no actividad interna. Se necesita una importación directa de bases de datos para cambiar
Los horarios internos de Chatwoot o eludir su oleoducto interno del evento y no es
utilizado porque funcionaría sólo con instalaciones auto-anfitrionas.

## n8n Community Node

Easyhook ha verificado n8n nodos:

```text
n8n-nodes-easyhook
```

En n8n, agregue un nodo y busque **Easyhook**.
directamente en la búsqueda del nodo. Instalaciones auto hospedadas que deshabilitan verificadas
Los ganglios comunitarios deben habilitarlos antes de que aparezca Easyhook.

Configuración credencial:

| Campo | Valor |
| --- | --- |
| API Key | Su clave de API Easyhook, por ejemplo `eh_live_xxx`. |

El test credencial llama `GET /v1/me`, por lo que sólo verifica que la clave de API es válida y puede identificar la organización.

Nodos disponibles:

| Node | Propósito |
| --- | --- |
| `Easyhook` | Envía mensajes, controla las conversaciones, maneja solo acciones de correo electrónico, envía plantillas/Flows WhatsApp, gestiona los medios de organización, descarga los medios de comunicación entrantes privados y cancela los mensajes programados. |
| `Easyhook Trigger` | Recibe entregas de Webhook Easyhook. Activación del flujo de trabajo registra la URL de producción n8n automáticamente a través de `/v1/webhooks`. |

Main `Easyhook` operaciones:

| Recursos | Operación | API endpoint utilizado |
| --- | --- | --- |
| Mensaje de Acción | Enviar texto | `POST /v1/messages/text` |
| Mensaje de Acción | Enviar texto + entrega humanizada | `POST /v1/messages/humanized-text` |
| Control de Mensajes | Marcar como Leer | `POST /v1/messages/read` |
| Control de Mensajes | Responder | `POST /v1/messages/reply` |
| Control de Mensajes | Show Typing | `POST /v1/messages/typing` |
| Control de Mensajes | Reacción | `POST /v1/messages/reaction` |
| Mensaje de Acción | Enviar medios | `POST /v1/messages/media` |
| WhatsApp Only | Enviar plantilla | `POST /v1/messages/template` |
| WhatsApp Only | Send Flow | `POST /v1/messages/flow` |
| WhatsApp Only | Record Opt-In o Opt-Out | `POST /v1/consent` |
| Medios | Subir | `POST /v1/media` |
| Medios | Lista | `GET /v1/media` |
| Medios | Descargar | `GET /v1/media/{id}/download` |
| Medios | Suprimir | `DELETE /v1/media/{id}` |
| Plantilla | Lista | `GET /v1/templates?from=...` |
| Plantilla | Sincronización de Meta | `POST /v1/templates/sync` |
| Cancelar Mensaje programado | Cancelar | `DELETE /v1/scheduled-messages/{id}` |
| Correo electrónico | Enviar / Respuesta | `POST /v1/messages/email` |
| Correo electrónico | Adelante. | `POST /v1/messages/email/forward` |
| Correo electrónico | Archive / Mark Read / Mark Unread | `POST /v1/email/actions` |

Plantilla que envía por defectos n8n a la entrada manual porque es la ruta más confiable a través de entornos n8n auto- hospedados:

1. Elija `Resource: WhatsApp Only`.
2. Elija `Operation: Send Template`.
3. Manténganse `Template Source: Enter Manually`.
4. Introduzca el nombre de plantilla aprobado y el código de idioma.
5. Agregue las variables Header, Body o Button en el orden de plantilla. `{{1}}`, fila 2 rellenos `{{2}}`Y así sucesivamente.

Si su instancia n8n puede cargar opciones dinámicas desde Easyhook, cambie `Template Source` a `Choose From Easyhook` para seleccionar plantillas y variables de Easyhook directamente.

Para webhooks en n8n:

1. Añadir `Easyhook Trigger` como el primer nodo de flujo de trabajo.
2. Seleccione la credencial de Easyhook API.
3. Seleccione un proveedor; el evento y las listas de alcance se actualizan automáticamente.
4. Seleccione un alcance y, cuando corresponda, elija una cuenta conectada de WABA, número, Página Mensajera o Instagram de la lista filtrada.
5. Activar el flujo de trabajo.

El nodo registra y elimina automáticamente la suscripción. Almacena el secreto de HMAC de una sola vez en los datos de flujo de trabajo privado n8n y valida cada entrega. No se requiere ningún portal webhook o configuración secreta manual.

Cuando un Webhook contiene `message.media.url`, la URL es intencionalmente privada.
Añadir un `Easyhook` nodo con `Resource: Media` y `Operation: Download`, mapa
`{{$json.message.media.url}}` dentro de `Media URL`, y elegir el binario de salida
campo (predeterminado: `data`). El nodo autentica la descarga con el mismo
Easyhook credential y emite datos binarios n8n para el archivo posterior, almacenamiento o
Nodos de IA.

Para una importación de historia de App Business App de WhatsApp, elija `Provider: WhatsApp` y `Event: Coexistence history (history.*)`, luego seleccione la organización, WABA, o alcance de número y active el flujo de trabajo **antes** conectando el teléfono de coexistencia o solicitando sincronización. `message.*` no incluye importaciones históricas. Easyhook envía lotes de más de 100 eventos; el disparador n8n expande cada lote en un producto de salida por evento normalizado.

Para WhatsApp, Easyhook expone una jerarquía consistente en el portal, API webhooks y n8n: **Organización → WABA → Número**. Meta Business Portfolios permanecen internos a bordo de metadatos. Plantillas, Flujos y configuración de consentimiento pertenecen a un WABA; medios reutilizables pertenece a la organización Easyhook y pueden ser enviados a través de cualquier canal conectado compatible; conversaciones y ventanas de número de cliente pertenecen a un consentimiento.

No enviar `tenant_id` Easyhook resuelve el organización de la clave API. Si una solicitud incluye `tenant_id`, la API devuelve:

```json
{ "error": "tenant_id_not_allowed" }
```

## Wallet y Billing

Easyhook está basado en el uso. No hay requisito mensual de plan de plataforma. Los números de telecomunicaciones son una excepción explícita: cada número comprado puede tener un cargo de activación por una sola vez, un período de calendario inicial prorrateado, alquiler recurrente cargado de antemano en el primer día de los meses posteriores, y mensajería o uso de voz medido como se documenta en [Telefonía](/telecom).

Cada organización tiene su propio equilibrio, moneda de facturación, contabilidad de uso, top-ups, gastos de API y gastos de sobreage de medios. Si el mismo cliente crea múltiples organizaciones, cada organización se financia por separado. La moneda de facturación se fija por el primer top-up financiado y no se puede mezclar mientras que la billetera tiene balance o historial pagado.

Los clientes pagan Meta directamente por las tasas de plantilla de WhatsApp. La cartera Easyhook sólo paga por el uso de la plataforma Easyhook.

Billable en V1:

| Usage | Fee |
| --- | --- |
| Llamada de API de cliente público que ejecuta una operación compatible | `0.01 MXN` o `0.001 USD` |
| Easyhook Inbox operation sent to a provider (send, reply, reaction, typing, read receipt, or email action) | `0.01 MXN` o `0.001 USD` |
| Transferencia de medios más allá de la cuota incluida | `3 MXN / GB` o `0.20 USD / GB` |
| Almacenamiento reutilizable de medios más allá de la cuota incluida | `3 MXN / GB / month` o `0.20 USD / GB / month` |
| Almacenamiento de medios de chat recibidos más allá de la cuota incluida | `3 MXN / GB / month` o `0.20 USD / GB / month` |

No facturable:

- Portal Solo acciones UI, incluyendo búsqueda de Inbox, filtros, navegación, pins, refrescos en tiempo real, administración de plantillas, gestión de flujos, configuración de consentimiento, registros, sincronización de conexión y pruebas manuales de **Probar API**.
- Metas webhooks utilizados internamente para actualizar el estado de Easyhook.
- Los mensajes entrantes y cada entrega Easyhook a las suscripciones de webhook del cliente, incluyendo mensajes, estado, plantilla, flujo, a bordo, cuenta y eventos de contacto.
- Cargos de meta plantilla/mensaje. Los que permanecen entre el cliente y Meta.
- El almacenamiento de medios se sube.

`Probar API` es libre sólo a través del flujo de portal autenticado. El portal
requiere una verificación de voltaje Cloudflare de uso único, aplica por IP compartida,
por usuario, y los límites de la ráfaga por organización, y envía una vida corta
afirmación firmada por el servidor a la API Easyhook. Copiar la solicitud de API pública en
un script no reproduce esos controles y la facturación de API pública normal
Las sesiones del portal requieren un nuevo registro después de 7 días.
Actualmente no tiene cuota de libre-operación diaria.

Relé webhook del cliente es gratis como un compañero de uso de Easyhook, no un
Autobús de eventos independientes ilimitados. Organizaciones sin saldo de cartera, un
exitoso top-up en los últimos 90 días, o cargado el uso de Easyhook en ese período
recibir hasta 10,000 **live** eventos retransmitidos por mes calendario.
Las organizaciones activas no están sujetas a esa asignación de evaluación.
la sincronización de la historia y las repeticiones explícitas de la historia no consumen la vida
subsidio de relé; siguen obligados por su propio trabajo y los límites de repetición.
la ingestión y la caja de entrada Easyhook continúan incluso cuando el relé del cliente en vivo
El subsidio está agotado.

Incluidos los cupos de medios en V1:

| Quota | Incluido |
| --- | --- |
| Transferencia de medios | `10 GB / month / tenant` |
| Almacenamiento de medios reutilizables | `1 GB / organization` |
| Almacenamiento de medios de chat recibido | `100 GB / tenant` |
| Retención de medios de chat recibidos | `6 months` |

La transferencia de medios incluye descargas de API de clientes y medios reutilizables de Easyhook atendidos a proveedores cuando un cliente envía por `media_name`. Los medios de chat recibidos se almacenan hasta `6 months`; almacenamiento se incluye hasta que el arrendatario tenga más que `100 GB` de los medios recibidos activos. Los medios de comunicación reutilizables no expiran; el almacenamiento se incluye hasta `1 GB` por organización. Los medios de plantilla se gestionan por separado.

Los promedios de los medios se cobran mensualmente de la cartera de la organización por un trabajo programado Supabase cron. El cron funciona el primer día de cada mes y factura el mes anterior utilizando la función de facturación de administración idempotent:

```sql
select public.easyhook_bill_media_overages('2026-07-01');
```

La fecha identifica el mes de facturación. Correr la función dos veces durante el mismo mes no cobra doblemente el mismo organización/categoría porque cada cargo utiliza una clave de idempotencia estable.

Si la cartera tiene un equilibrio insuficiente, la API pública facturable llama a devolver:

```json
{
  "error": "insufficient_balance",
  "billing": {
    "amount_cents": 1,
    "balance_after_cents": 0,
    "currency": "MXN"
  }
}
```

Uso `Idempotency-Key` en POST/DELETE solicita que su sistema pueda volver a entrar. Easyhook utiliza esta clave para evitar la doble carga de la misma operación API. Para mensajes de texto programados, medios y plantillas, también evita crear un segundo mensaje programado y devuelve el registro original con `idempotent_replay: true`.

```http
Idempotency-Key: order-123-send-confirmation
```

Si no `Idempotency-Key` es enviado, Easyhook trata cada solicitud HTTP como una operación de facturación independiente.

Las carteras USD utilizan un acumulador fraccional porque un costo de operación de API `0.001 USD`, una décima parte de un centavo. Easyhook deduce un USD por ciento cada diez operaciones facturables al tiempo que preserva los precios exactos del nivel de operación. Un saldo de cero USD bloquea la primera nueva operación facturable; no concede llamadas fraccionadas al crédito.

Los top-ups manuales MXN o USD deben ser realizados con el administrador local Easyhook CLI.
Resolve la referencia de la organización pública, verifica la cartera fija
moneda, requiere una referencia de pago y utiliza la cartera auditada, idempotente
función de crédito:

```bash
easyhook recharge 500 MXN to EH-130FF0EC \
  --reference "SPEI-20260729-001"
```

Ejecute el mismo comando con `--dry-run` para validar la organización, proyecto,
la moneda y el saldo resultante sin escritura.
documentado en el corredor interno de administración de carteras.
no editar `wallets.balance_cents` directamente.

## Índice de punto final

Puntos finales recomendados de API de clientes:

| Método | Punto final | Ámbito | Uso |
| --- | --- | --- | --- |
| `GET` | `/v1/me` | cualquier clave válida | Validar una clave de API e inspeccionar sus organizacións/scopios. Útil para pruebas credenciales n8n. |
| `GET` | `/v1/senders` | cualquier clave válida | Lista de identificadores de remitente nativo de proveedor. Uso `account_id` como tal `from`. |
| `GET` | `/v1/senders/{account_id}/health` | cualquier clave válida | Lea la salud normalizada de un remitente de propiedad de arrendatario sin exponer las credenciales del proveedor. |
| `DELETE` | `/v1/senders/{account_id}` | `onboarding:write` | Desconectar un canal de propiedad de arrendatario por su identificador de remitente nativo proveedor. `messages:write` las teclas siguen siendo compatibles. |
| `GET` | `/v1/conversations?from=...` | `messages:read` | Lista recientes conversaciones WhatsApp para un remitente de propiedad de organización. `messages:write` las teclas siguen siendo compatibles. |
| `GET` | `/v1/conversations/{contact}/messages?from=...` | `messages:read` | Lea los mensajes recientes inbound and outbound WhatsApp con un solo contacto. `messages:write` las teclas siguen siendo compatibles. |
| `GET` | `/v1/conversations/{contact}/messages/wait?from=...` | `messages:read` | Espera el siguiente mensaje de WhatsApp de entrada de un contacto. Intended for bounded MCP/agent conversations. |
| `POST` | `/v1/messages/text` | `messages:write` | Punto final de texto canónico para WhatsApp, Telefonía/SMS, Messenger, Instagram, Telegram, Mercado Libre y TikTok. Enviar `channel` sólo cuando `from` es ambiguo. |
| `POST` | `/v1/messages/quick-replies` | `messages:write` | Enviar un mensaje de texto con 1–13 botones de respuesta rápida a través de Messenger o Instagram. |
| `POST` | `/v1/messages/interactive` | `messages:write` | Enviar la respuesta soportada o los botones URL a través de WhatsApp, Messenger, Instagram, Telegram o TikTok Business Messaging. TikTok acepta solo botones de respuesta. |
| `POST` | `/v1/messages/email` | `messages:write` | Enviar un nuevo correo electrónico o respuesta a través de Gmail, Outlook, o una cuenta IMAP/SMTP conectada. |
| `POST` | `/v1/messages/humanized-text` | `messages:write` | Texto humanizado para WhatsApp, Messenger, Instagram y Telegram. Los controles de presencia son el mejor esfuerzo y nunca reemplazan el envío real. |
| `POST` | `/v1/messages/read` | `messages:write` | Mark lee en WhatsApp, Messenger, Instagram o TikTok Business Messaging. |
| `POST` | `/v1/messages/reply` | `messages:write` | Respuesta contextual en WhatsApp, Messenger, Instagram, Telegram o mensajería de negocios de TikTok. |
| `POST` | `/v1/messages/typing` | `messages:write` | Mostrar escribiendo en WhatsApp, Messenger, Instagram, Telegram o TikTok Business Messaging. |
| `POST` | `/v1/messages/reaction` | `messages:write` | Añadir o eliminar una reacción en WhatsApp o Telegram. |
| `POST` | `/v1/messages/media` | `messages:write` | Envíe los medios compatibles a través de WhatsApp, Telefonía/MMS, Messenger, Instagram, Telegram o TikTok Business Messaging. TikTok actualmente soporta imágenes; el MMS programado aún no está soportado. |
| `GET` | `/v1/telecom/capabilities` | `telephony:read` | Descubra las capacidades normalizadas de llamadas Telnyx y WhatsApp. |
| `GET` | `/v1/call-routing?phone_id={id}` | `telephony:read` | Lea la política de distribución de llamadas del número Telnyx de propiedad de un organización; agregue `channel=whatsapp` para un teléfono de WhatsApp. |
| `PATCH` | `/v1/call-routing?phone_id={id}` | `telephony:write` | Configure los destinos ordenados para un número. WhatsApp acepta portal/app solamente; Telnyx también acepta una etapa de teléfono externo alberca. |
| `POST` | `/v1/call-endpoints` | `telephony:write` | Registre o latido de corazón una web, móvil, API o SIP que responda al punto final. |
| `POST` | `/v1/call-endpoints/{id}/token` | `telephony:write` | Emitir un WebRTC JWT de corta duración para un punto final existente. |
| `POST` | `/v1/whatsapp/calling/permissions` | `telephony:write` | Envía la solicitud explícita de permiso de llamada iniciada por Meta. |
| `POST` | `/v1/calls` | `telephony:write` | Iniciar una llamada prepagada Telnyx o WhatsApp con una duración máxima forzada; `handler: "ai"` comienza una llamada de salida consentida de OnceLabs. |
| `POST` | `/v1/consent` | `telephony:write` o `messages:write` | Grabar la voz del organización-scopio de la opción de entrada / salida de evidencia (o el consentimiento de mensajería existente). |
| `GET` | `/v1/calls/{id}` | `telephony:read` | Lea estado normalizado, duración, asignación y detalles de fallo. |
| `GET` | `/v1/calls/{id}/signaling` | `telephony:read` | Lea la respuesta de salida WhatsApp SDP cuando esté disponible. |
| `POST` | `/v1/calls/{id}/actions/claim` | `telephony:write` | Atómicomente reclamar una llamada ofrecida; exactamente un punto final gana. |
| `POST` | `/v1/calls/{id}/actions/pre-accept` | `telephony:write` | Pre-aceptar una llamada de WhatsApp de entrada con una respuesta SDP. |
| `POST` | `/v1/calls/{id}/actions/accept` | `telephony:write` | Aceptar una llamada de WhatsApp reclamada. |
| `POST` | `/v1/calls/{id}/actions/decline` | `telephony:write` | Desclina este punto final y ruta al siguiente agente disponible. |
| `POST` | `/v1/calls/{id}/actions/hangup` | `telephony:write` | Terminar a través del proveedor subyacente. |
| `POST` | `/v1/messages/template` | `messages:write` | Enviar o programa aprobado plantillas WhatsApp. |
| `POST` | `/v1/messages/flow` | `messages:write` | Envíe un flujo de WhatsApp publicado dentro de la ventana de 24 horas. |
| `GET` | `/v1/scheduled-messages/{id}` | `messages:read` | Reconcile un mensaje programado, su WAMID, fallo de ejecución, y el último estado Meta. `messages:write` las teclas siguen siendo compatibles. |
| `DELETE` | `/v1/scheduled-messages/{id}` | `messages:write` | Cancelar un mensaje programado que no ha comenzado a procesar. |
| `POST` | `/v1/media` | `media:write` | Sube los medios reutilizables permanentes para la organización API-key. |
| `GET` | `/v1/media` | `media:read` | Lista la reutilizable biblioteca de medios de la organización. |
| `GET` | `/v1/media/{id}/download` | `media:read` | Descargar Easyhook-hosted media bytes para clientes CRMs/inboxes. |
| `DELETE` | `/v1/media/{id}` | `media:write` | Eliminar los medios reutilizables. |
| `GET` | `/v1/templates?from=...` | `templates:read` | Listar plantillas de WhatsApp para el WABA detrás `from`. |
| `POST` | `/v1/templates/sync` | `templates:write` | Plantillas de sincronización de Meta en Easyhook. |
| `POST` | `/v1/templates/classify` | `templates:write` | Regrese asesoramiento de categoría no bloqueante sin someterse a Meta. |
| `POST` | `/v1/templates` | `templates:write` | Crear una plantilla de WhatsApp en Meta y almacenarla localmente. |
| `POST` | `/v1/templates/media` | `templates:write` | Sube la imagen, el vídeo o los medios de encabezado de documentos y obtenga el mango de creación Meta. |
| `POST` | `/v1/templates/delete` | `templates:write` | Eliminar una plantilla de WhatsApp en Meta y localmente. |
| `GET` | `/v1/flows?from=...` | `flows:read` | List WhatsApp Flows for the WABA behind `from`. |
| `POST` | `/v1/flows/sync` | `flows:write` | Sync WhatsApp Flujos de Meta. |
| `POST` | `/v1/flows` | `flows:write` | Cree un flujo de WhatsApp. |
| `POST` | `/v1/flows/{id}/publish` | `flows:write` | Publish a WhatsApp Flow. |
| `DELETE` | `/v1/flows/{id}` | `flows:write` | Eliminar un flujo de WhatsApp. |
| `GET` | `/v1/flows/{id}/submissions?from=...` | `flows:read` | Lista de envíos Flow almacenados. |
| `GET` | `/v1/consent/config?from=...` | `flows:read` | Lea la configuración de consentimiento de WABA. También acepta `waba_id` o `phone_id`. |
| `PATCH` | `/v1/consent/config` | `flows:write` | Actualizar copia de consentimiento de WABA y palabras clave personalizadas. Acepta `from`, `phone_id`, `waba_id`. |
| `POST` | `/v1/consent/enable` | `flows:write` | Crear/publicar flujos de opción predeterminados y de exclusión y permitir el consentimiento de WABA. Acepta `from`, `phone_id`, `waba_id`. |
| `POST` | `/v1/consent` | `messages:write` | Prueba de consentimiento de registro, o enviar el flujo de opción de entrada/opt-out predeterminado cuando `mode` se proporciona. |
| `GET` | `/v1/consent/status?from=...&contact=...` | `messages:read` o legado `messages:write` | Leer el consentimiento de servicio y marketing para un contacto en el WABA detrás `from`. |
| `PUT` | `/v1/contacts` | `messages:write` | Actualizar Ídempotentemente los nombres de contacto Easyhook-local para el WABA detrás `from`. |
| `POST` | `/v1/onboarding/sessions` | `onboarding:write` | Cree un canal hospedado en la sesión de a bordo propiedad del organización de clave API. |
| `POST` | `/v1/onboarding/sessions/send` | `onboarding:write` | Crear una sesión de a bordo y enviar su URL de un número autorizado de WhatsApp. |
| `GET` | `/v1/onboarding/sessions/{token}` | opaque session token | Lea o abra una sesión de a bordo organizada. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | opaque session token | Completa el registro integrado de WhatsApp. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | opaque session token | Completa una conexión directa de canal hospedado. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | opaque session token | Comience un proveedor anfitriona de flujo OAuth. |
| `GET` | `/v1/webhooks` | cualquier clave válida | Lista de suscripciones webhook propiedad de la organización API-key. |
| `GET` | `/v1/webhooks/options?provider=...&scope_type=...` | cualquier clave válida | Descubra proveedores compatibles, filtros de eventos, alcances y identificadores de remitente público. |
| `POST` | `/v1/webhooks` | cualquier clave válida | Crear una suscripción webhook; su secreto HMAC/auth es devuelto una vez. |
| `GET` | `/v1/webhooks/{id}` | cualquier clave válida | Lea una suscripción de webhook propiedad sin exponer su secreto. |
| `PATCH` | `/v1/webhooks/{id}` | cualquier clave válida | Reemplazar sólo los suscritos `events`; URL, secreto, autenticación, proveedores y alcance permanecen inalterados. |
| `DELETE` | `/v1/webhooks/{id}` | cualquier clave válida | Eliminar una suscripción de webhook propiedad. |
| `POST` | `/v1/webhooks/{id}/replay` | cualquier clave válida | Retry falló los lotes de entrega, opcionalmente filtrado por `sync_id`. |
| `POST` | `/v1/webhooks/{id}/history-replays` | cualquier clave válida | Reenviar mensajes o contactos almacenados para `phone_id` utilizando `replay_type`. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | cualquier clave válida | Lea el progreso de la historia persistente. |
| `POST` | `/v1/messages/channel/text` | `messages:write` | alias de compatibilidad precatadas; nuevas integraciones utilizan `/v1/messages/text`. |
| `POST` | `/v1/messages/sms` | `messages:write` | Compatibilidad precatada alias para Telefonía; nuevas integraciones utilizan `/v1/messages/text` con `channel: "sms"` cuando sea necesario. |
| `POST` | `/v1/messages/channel/media` | `messages:write` | Enviar Mensajero, Instagram, Telegram o medios TikTok por referencia de proveedor o enlace público compatibles. |
| `POST` | `/v1/messages/channel/media/upload` | `messages:write` | Sube los medios a Easyhook temporalmente y envíalo a través de Messenger o Instagram. |

Portal/admin endpoints existen para el a bordo, administración de API-key, gestión de webhook e ingestión de Meta webhook. Están listados cerca del final de este documento para que los clientes puedan reconocerlos, pero las nuevas integraciones de productos deben utilizar los puntos finales recomendados anteriormente.

Uso `POST /v1/messages/reaction` con `from`, `to`, `message_id`, y `emoji`. Un vacío `emoji` elimina la reacción actual.

## Messenger e Instagram Respuestas rápidas

Easyhook expone el contrato de réplica rápida del texto común apoyado por Messenger
e Instagram. `from` es la página conectada o el ID de cuenta de Instagram, y `to`
es el ID de contacto con el proveedor recibido en Easyhook webhooks.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/quick-replies \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "17841400000000001",
    "to": "17841400000000002",
    "body": "¿Cómo podemos ayudarte?",
    "quick_replies": [
      { "title": "Ventas", "payload": "sales" },
      { "title": "Soporte", "payload": "support" }
    ]
  }'
```

Reglas:

- Enviar entre 1 y 13 respuestas.
- `title` es visible para el contacto y acepta a la mayoría de 20 caracteres.
- `payload` es un valor estable definido por la aplicación y acepta en la mayoría de 1.000
  personajes.
- Sólo las respuestas rápidas de texto se normalizan en ambos proveedores.
  teléfono, correo electrónico y variantes de imagen son intencionalmente no parte de este punto final.
- Las respuestas rápidas de Instagram no están disponibles en la experiencia de escritorio.

Cuando el contacto escoge una opción, suscribirse a `message.quick_reply`:

```json
{
  "type": "message.received",
  "channel": "instagram",
  "message": {
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Automatización de la ruta `message.quick_reply.payload`; uso `message.text` o
`message.quick_reply.title` sólo como la etiqueta se muestra a la persona.

## Botones Interactivos multicanal

Utilice un contrato para botones de conversación en WhatsApp, Messenger, Instagram,
y Telegram. Esta operación es el tráfico de conversaciones de forma libre, no un WhatsApp
plantilla:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/interactive \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "123456789012345",
    "to": "15550100002",
    "body": "¿Qué quieres hacer?",
    "buttons": [
      { "type": "reply", "title": "Agendar", "payload": "schedule" },
      { "type": "reply", "title": "Hablar con alguien", "payload": "agent" }
    ]
  }'
```

Para abrir una página como un mapa, utilice una URL HTTPS pública:

```json
{
  "type": "url",
  "title": "Cómo llegar",
  "url": "https://example.com/map"
}
```

Reglas comunes:

- `buttons` contiene 1–3 artículos y cada uno `title` tiene a la mayoría 20 caracteres.
- `reply` requiere un establo `payload` de la mayoría de 64 UTF-8 bytes.
- `url` requiere una URL HTTPS pública.
- WhatsApp requiere una ventana abierta de servicio al cliente.
  plantilla aprobada.
- WhatsApp acepta hasta tres `reply` botones o uno `url` botón; él
  no puede mezclar ambos tipos en el mismo mensaje.
  antes de contactar a Meta.
- Messenger, Instagram y Telegram pueden mezclar botones de respuesta y URL.
- Los clics de URL no producen un webhook de selección.
  normalizado `message.quick_reply`.
- El mayor `/v1/messages/quick-replies` endpoint remains available for
  Menús Messenger e Instagram con hasta 13 opciones de respuesta temporal.

## Gmail

Gmail está representado como un canal Easyhook normal. La clave de la organización API
selecciona la organización y `from` debe ser la dirección Gmail exacta conectada.
El email entrante se almacena en la bandeja de entrada compartida y se entrega a través del cliente
webhooks como `message.received`. Los mensajes enviados desde Gmail fuera de Easyhook son
almacenados como eventos de salida sin crear una segunda conversación con el cliente.

Enviar un nuevo correo electrónico de texto simple:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "soporte@example.com",
    "to": "cliente@example.net",
    "subject": "Seguimiento",
    "body": "Hola, damos seguimiento a tu solicitud."
  }'
```

Uso `html` cuando se requiere un correo electrónico rico. `body` y `html`
crea un mensaje multiparto con un retroceso de texto simple:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Tu solicitud está lista",
  "body": "Tu solicitud está lista.",
  "html": "<p>Tu solicitud está <strong>lista</strong>.</p>"
}
```

Responder dentro de un hilo existente usando el normalizado `message.id` recibidos
el Webhook inbound:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Re: Seguimiento",
  "body": "Gracias por confirmar.",
  "reply_to_message_id": "provider-message-id"
}
```

`reply_to_message_id` es la normalización `message.id` desde el Webhook inbound.
Easyhook lo utiliza para resolver la operación de respuesta específica del proveedor.
las integraciones no deben enviar `thread_id`, `in_reply_to`, `references`; esos
campos siguen siendo controles avanzados opcionales para los calladores que ya poseen
Valores del proveedor.

Los campos de mensajes de Gmail normalizados son:

| Campo | Descripción |
| --- | --- |
| `message.text` | Cuerpo de texto simple o un retroceso de texto seguro derivado de HTML. |
| `message.subject` | Asunto de correo electrónico. |
| `message.html` | Cuerpo HTML original cuando presente. Trate de él como contenido no confiable. |
| `message.thread_id` | ID de rosca Gmail utilizado para respuestas. |
| `message.message_id_header` | RFC Message-ID utilizado por `in_reply_to`. |
| `message.in_reply_to` | Director de respuesta RFC del mensaje recibido. |
| `message.references` | cadena de referencias RFC. |
| `message.attachments` | Metadatos adjuntos privados con `media_asset_id`, nombre de archivo, tipo MIME, y tamaño. |
| `message.is_read` | El proveedor leyó estado. |
| `message.label_ids` | Etiquetas Gmail utilizadas para filtros Inbox. |
| `message.inference_classification` | Outlook `focused` o `other`. |
| `message.flags` | Banderas IMAP tales como `\Seen` y `\Flagged`. |

`POST /v1/messages/email` acepta hasta 10 adjuntos y 20 MB decodificados en
formatos compatibles son JPEG, PNG, WebP, MP4, 3GPP, AAC, M4A, MP3, AMR,
OGG, PDF, texto plano, Word, Excel y PowerPoint:

```json
{
  "attachments": [
    {
      "filename": "report.pdf",
      "content_type": "application/pdf",
      "content_base64": "JVBERi0xLjc..."
    }
  ]
}
```

Rutas normalizadas adicionales:

| Método | Punto final | Propósito |
| --- | --- | --- |
| `POST` | `/v1/messages/email/forward` | Adelante. `message_id` a otra dirección con una opción `note`. |
| `POST` | `/v1/email/actions` | `mark_read`, `mark_unread`, `archive` un mensaje. |
| `POST` | `/v1/email/drafts` | Crea un borrador. |
| `PUT` | `/v1/email/drafts/{draft_id}` | Reemplazar un borrador. |
| `POST` | `/v1/email/drafts/{draft_id}/send` | Envía un borrador. |

Google envía cambios Gmail a través de Pub/Sub. Easyhook reconoce el Pub/Sub
solicitud de inmediato, resuelve cambios con `users.history.list`, deduplicados
mensajes por Gmail ID de mensaje, y avanza el cursor de historia almacenado sólo después
el procesamiento tiene éxito. Los relojes Gmail expiran, así que Easyhook programa un automático
renovación 24 horas antes de cada caducidad.
`POST /v1/channels/gmail/watch/renew-all` endpoint remains available for
operaciones y recuperación.

### Configuración Google Cloud

1. Permite la API de Gmail y Pub/Sub API.
2. Configure el OAuth redirige URI como
   `https://api.easyhook.dev/v1/channels/gmail/oauth/callback`.
3. Crear un Pub/Sub tema y subvención
   `gmail-api-push@system.gserviceaccount.com` el papel de Pub/Sub Editor
   ese tema.
4. Crear una suscripción de push cuya URL es
   `https://api.easyhook.dev/v1/channels/gmail/webhook?token=YOUR_RANDOM_TOKEN`.
5. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_OAUTH_STATE_SECRET`, `GMAIL_PUBSUB_TOPIC`, y
   `GMAIL_PUBSUB_VERIFICATION_TOKEN` en el backend.
6. Verifique que Easyhook Cloud Tasks está configurado. Cada Gmail exitoso
   conexión programa su próxima renovación de reloj automáticamente.

Solicitudes de Easyhook `openid`, `userinfo.email`, `userinfo.profile`, y
`gmail.modify`. El alcance restringido de Gmail se utiliza para recibir correo, enviar
respuestas, preservar los hilos y mantener el estado del mensaje en el Easyhook compartido
Inbox. Easyhook no utiliza los datos de Gmail para la publicidad.
versión soporta texto plano, HTML, adjuntos, nuevos mensajes, roscado
respuestas, cambios estatales, reenvío y borradores.

Desconectar un canal Gmail de **Organización** detiene su reloj Gmail,
revoca la subvención OAuth almacenada, y elimina la credencial cifrada de
Easyhook.

### Grabación de verificación de Google

Grabar una captura de pantalla continua y silenciosa con etiquetas cortas en pantalla:

1. Inicie sesión en Easyhook y abra **Connect <unk> Gmail**.
2. Haga clic en **Connect Gmail** y muestre la pantalla de consentimiento de Google, incluyendo la
   cuenta y pidió permiso de Gmail.
3. Consentimiento completo y mostrar la cuenta Gmail conectada en Easyhook.
4. Enviar un mensaje desde una dirección externa a la cuenta Gmail conectada.
5. Mostrar el mismo remitente, sujeto y cuerpo que llega a la bandeja de entrada Easyhook.
6. Responder de Easyhook y mostrar la respuesta en el mismo hilo en Gmail.
7. Enviar un nuevo correo electrónico a través de `POST /v1/messages/email` y mostrarlo llegar a
   el receptor.

Sugerencia de justificación de la cirugía restringida:

> Easyhook es una API de mensajería multicanal y una bandeja de entrada compartida.
> `gmail.modify` el alcance es requerido para que un propietario de la cuenta pueda conectar Gmail,
> recibir y leer mensajes en Easyhook, enviar nuevos mensajes e hilos
> respuestas, y mantener el estado del mensaje. Los datos de Gmail están aislados por organización,
> encriptado en tránsito y en reposo, y no se utiliza para la publicidad.

## Outlook e IMAP/SMTP

Las cuentas de correo electrónico genérico y de Outlook utilizan el mismo contrato público que Gmail.
Conectar Outlook con Microsoft OAuth o conectar otro proveedor con su IMAP
y configuración SMTP. Después de la conexión, utilice la dirección de correo electrónico exacta como `from`:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support@company.com",
    "to": "customer@example.net",
    "subject": "Order update",
    "body": "Your order is ready."
  }'
```

El mismo punto final acepta `html`, `reply_to_message_id`, `thread_id`,
`in_reply_to`, y `references` para cada proveedor de correo electrónico.
`reply_to_message_id` con el Webhook de entrada `message.id` para el más simple
respuesta roscada. Las respuestas tienen una forma normalizada:

```json
{
  "ok": true,
  "provider": "outlook",
  "channel_id": "channel-id",
  "message_id": "provider-message-id",
  "thread_id": "provider-thread-id"
}
```

Los mensajes entrantes de todos los proveedores de correo electrónico producen `message.received` con
`message.subject`, `message.text`, opcional `message.html`, cabezales de rosca,
metadatos del filtro del proveedor, y archivos adjuntos almacenados en privado. HTML no está conectado
entrada y debe ser santificado o renderizado dentro de una caja de arena.

Las suscripciones de Outlook están protegidas con un Microsoft Graph aleatorio
`clientState`, procesado asincrónicamente, y renovado antes de la caducidad.
Configure estos secretos de backend:

- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_STATE_SECRET`
- `MICROSOFT_OAUTH_REDIRECT_URI` establecido
  `https://api.easyhook.dev/v1/channels/outlook/oauth/callback`

Las necesidades de aplicación de Microsoft delegadas `User.Read`, `Mail.ReadWrite`, y
`Mail.Send`, más `openid`, `profile`, `email`, y `offline_access`.

Las credenciales IMAP/SMTP se validan a tiempo de conexión y se almacenan en el
encriptada cámara secreta Easyhook. Easyhook registra el UID actual del buzón
cursor, luego encuesta sólo nuevos mensajes de la bandeja de entrada. Use TLS, una contraseña de la aplicación, o una
Credencial SMTP específico del proveedor; nunca use una contraseña personal cuando el correo
proveedor admite contraseñas de aplicaciones.

API de cliente envía a través de Gmail, Outlook, y consumir IMAP/SMTP
`message.email.send`. Las operaciones del proveedor de la caja Easyhook utilizan la
equivalente `inbox.*` operación y el mismo precio por operación.
el trabajo no consume el equilibrio de la cartera.

Iniciar una llamada de la Inbox no crea una carga de cooperación API separada.
Para llamadas Telnyx, el importe de la compañía reservada se completa con el proveedor firmado
eventos de costo y la retención no utilizado se devuelve.
son facturados directamente por Meta a la WABA del cliente; Easyhook cobra sus
`call.per.minute` cuota de la plataforma sólo después de que la llamada se conecte.
llamada sin respuesta por lo tanto no tiene cargo de llamada Easyhook.

Una solicitud de autorización de llamada de WhatsApp coloca una cartera reembolsable primero.
operación se carga sólo después de que Meta acepte la solicitud; un rechazo del proveedor
libera la suspensión completa.

La ventana de servicio al cliente de WhatsApp 24 horas no se aplica al correo electrónico o
Telegrama. Estos canales pueden enviar en cualquier momento permitido por su proveedor.

## Telegram

Conectar un bot de Telegram desde **Connect <unk> Telegram** usando el token creado por
BotFather. Easyhook valida el token, lo almacena en el organización cifrado
bóveda secreta, y configura un Webhook Telegram protegido por Telegram
`X-Telegram-Bot-Api-Secret-Token` Cabeza.

Después de la conexión, utilice el endpoint de texto estándar:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@my_easyhook_bot",
    "to": "123456789",
    "body": "Hola desde Easyhook"
  }'
```

Se pueden enviar imágenes de telegrama, vídeo, audio y documentos
`POST /v1/messages/media` con un público `link`. Actualizaciones de telegrama entrante
normalizado a la misma `message.received` contrato utilizado por los otros canales.
Los medios entrantes actualmente incluyen metadatos de archivos Telegram; archivo automático
almacenamiento y una URL de descarga pública Easyhook no son parte de la primera versión.

Desconectar un canal de Telegram elimina su webhook protegido de Telegram antes
Easyhook elimina el token de bot cifrado.

## Medición de negocios de TikTok

Conectar TikTok de **Connect <unk> TikTok Business Messaging**. Easyhook utiliza
El flujo de autorización de los contables de TikTok.
`message.list.read`, `message.list.send`, y `message.list.manage` para
mensajería, más `user.info.basic`, `user.account.type`, `user.info.username`,
y `user.info.profile` para identificar la cuenta de negocio conectada. No
solicitar publicidad, campaña, píxel, medición o permisos CTX.

El perfil seleccionado de TikTok ya debe ser una cuenta de negocios **. Easyhook
comprueba el tipo de cuenta durante OAuth y devuelve
`tiktok_business_account_required` sin almacenar la conexión cuando TikTok
reporta una cuenta personal. Para conexiones creadas antes de esta validación,
el mismo error se devuelve en el envío en lugar de solicitar incorrectamente otro
cambiar el tipo de cuenta en TikTok y luego autorizarlo de nuevo.

TikTok Business Messaging no está disponible actualmente para cuentas de negocios
registrado en los Estados Unidos, el Espacio Económico Europeo, Suiza, o el
Reino Unido. Easyhook preserva esta restricción del proveedor como
`tiktok_business_messaging_region_unsupported`; reconectar la misma cuenta
un negocio no puede iniciar una nueva conversación de TikTok. Después de un
mensajes de usuario el negocio, TikTok permite a la mayoría de 10 respuestas de negocios
las siguientes 48 horas. Easyhook vuelve
`tiktok_messaging_window_closed_or_quota_reached` cuando el proveedor rechaza un
enviar por esta política.

Utilice los identificadores nativos de proveedor de la webhook sin prefijos:

- `account.id` es el identificador abierto de la cuenta comercial TikTok y se utiliza como
  `from`.
- `contact.id` es el identificador remoto estable del usuario. Preserve exactamente y
  utilizarlo como `to` para llamadas posteriores.
- `message.thread_id` es el identificador de conversación del proveedor.
  lo acepta como `to` para la compatibilidad atrasada y la depuración a nivel de proveedor.
- `message.id` es el ID del mensaje del proveedor y la clave de idempotencia del mensaje.

El texto estándar, respuesta, escritura, lectura, respuesta interactiva, botón de respuesta, imagen y
Los puntos finales de texto programados resuelven TikTok desde `from`. Texto entrante, imagen,
video, contest-button, read, y eventos de privacidad utilizan el mismo Easyhook normalizado
sobre como otros canales. Los medios almacenados utilizan una URL privada Easyhook y deben
ser descargado con la clave de la organización API.

## Conversaciones y mensajes recientes

Las lecturas de conversaciones están aisladas por organización mediante la clave de API y se paginan por `from`. Las respuestas públicas contienen números de teléfono visibles para el cliente, IDs de mensaje del proveedor, contenido normalizado y estado de entrega. No exponen IDs internos de organización, IDs de filas de Supabase, referencias de tokens, payloads sin procesar de Meta ni URLs de almacenamiento privado.

Las nuevas claves de API incluyen `messages:read`. Las claves creadas antes de la introducción de este alcance pueden utilizar estos puntos finales cuando ya tienen `messages:write`.

### Lista de conversaciones

```bash
curl "https://api.easyhook.dev/v1/conversations?from=15550100002&limit=20" \
  -H "Authorization: Bearer eh_live_xxx"
```

Parámetros de consulta:

| Campo | Necesidad | Descripción |
| --- | --- | --- |
| `from` | Sí. | Sender de WhatsApp propiedad del organización. El formato se normaliza a los dígitos. |
| `limit` | No. | Defaults a 20. |
| `before` | No. | ISO 8601 `next_cursor` de la respuesta anterior. |

Respuesta:

```json
{
  "from": "15550100002",
  "conversations": [
    {
      "contact": {
        "phone": "15550100003",
        "name": "Ana"
      },
      "last_message": {
        "id": "wamid...",
        "direction": "in",
        "type": "text",
        "text": "Hola",
        "media": null,
        "reaction": null,
        "status": null,
        "source": "webhook",
        "timestamp": "2026-07-18T16:00:00.000Z"
      },
      "message_count": 4,
      "service_window": {
        "open": true,
        "expires_at": "2026-07-19T16:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

`message_count` es el número de mensajes encontrados en la ventana de resultado escaneado, no un contador de vida permanente.

### Leer una conversación

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages?from=15550100002&limit=50" \
  -H "Authorization: Bearer eh_live_xxx"
```

Los mensajes son devueltos más antiguos a los más nuevos dentro de cada página, lo que permite a un agente o buzón procesarlos en orden conversacional.

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "messages": [
    {
      "id": "wamid...",
      "direction": "in",
      "type": "text",
      "text": "¿Ya quedó mi pedido?",
      "media": null,
      "reaction": null,
      "status": null,
      "source": "webhook",
      "timestamp": "2026-07-18T16:00:00.000Z"
    },
    {
      "id": "wamid...",
      "direction": "out",
      "type": "text",
      "text": "Sí, ya está listo.",
      "media": null,
      "reaction": null,
      "status": "read",
      "source": "api",
      "timestamp": "2026-07-18T16:01:00.000Z"
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

Posibles errores:

| Situación | Error | Significado |
| --- | --- | --- |
| `400` | `missing_required_fields` | `from` o el contacto de la ruta está desaparecido/inválido. |
| `400` | `invalid_limit` | `limit` está fuera de 1-100. |
| `400` | `invalid_before` | `before` no es una marca ISO 8601. |
| `400` | `tenant_id_not_allowed` | Las solicitudes públicas no pueden anular la tenacidad API-key. |
| `401` | `invalid_api_key` | La clave de API está desaparecida o inválida. |
| `403` | `missing_required_scope` | La llave no tiene `messages:read` ni legado `messages:write`. |
| `404` | `phone_not_found` | `from` no está conectado a la organización API-key. |

### Espera el siguiente mensaje de entrada

Use un ID de mensaje de proveedor como cursor estable. Primero lea la conversación, mantenga
el más nuevo `messages[].id`, y enviarlo como `after_id`:

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages/wait?from=15550100002&after_id=wamid.example&timeout_seconds=60&limit=1" \
  -H "Authorization: Bearer eh_live_xxx"
```

Parámetros de consulta:

| Campo | Necesidad | Descripción |
| --- | --- | --- |
| `from` | Sí. | El remitente de WhatsApp propiedad del arrendatario. |
| `after_id` | recomendado | Último ID de mensaje de proveedor procesado (`wamid`). Debe pertenecer a este remitente y contacto. |
| `after` | no | Cursor ISO 8601. Utilice sólo cuando no hay un ID de mensaje estable. No se combine con `after_id`. |
| `timeout_seconds` | no | Long-poll duración de 1 a 300 segundos. Defectos a 60. |
| `limit` | no | Los mensajes máximos de entrada devueltos, de 1 a 20. Defaults a 1. |

La solicitud regresa inmediatamente cuando llega un nuevo mensaje de entrada:

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "timed_out": false,
  "messages": [
    {
      "id": "wamid.next",
      "direction": "in",
      "type": "text",
      "text": "Sí, continúa.",
      "timestamp": "2026-07-24T00:10:00.000Z"
    }
  ],
  "cursor": "2026-07-24T00:10:00.100Z"
}
```

Un timeout normal devuelve HTTP `200`, `timed_out: true`y un vacío
`messages` array. No es un error y no autoriza al agente a extender
su tarea indefinidamente. Easyhook permite a la mayoría de dos esperas concurrentes por clave API
y retornos `429 too_many_active_waits` con `Retry-After: 5` arriba de ese límite.
La solicitud de espera en sí no deduce el saldo de la cartera. `GET /v1/conversations`
y `GET /v1/conversations/{contact}/messages` son normal API de clientes facturables
Lee.

Los mensajes son entrada sin confianza incluso cuando se permite el contacto.
integraciones no deben tratar el texto de WhatsApp como aprobación para revelar credenciales,
hacer pagos, cambiar permisos, realizar acciones destructivas, implementar código, o
ampliar la tarea activa.

Errores de espera adicionales:

| Situación | Error | Significado |
| --- | --- | --- |
| `400` | `after_id_not_found` | El mensaje del cursor no existe para el remitente resuelto. |
| `400` | `after_id_contact_mismatch` | El cursor pertenece a un contacto diferente. |
| `400` | `ambiguous_cursor` | Ambos `after_id` y `after` fueron proporcionados. |
| `400` | `invalid_timeout_seconds` | El tiempo está fuera de 1-300 segundos. |
| `429` | `too_many_active_waits` | Esta clave de API ya tiene dos esperas activas en la instancia actual de API. |

## Hosted Channel Onboarding

Uso alojado a bordo cuando un desarrollador quiere que su propio cliente conecte un
canal sin dar acceso al cliente al portal Easyhook. La clave API
determina la organización de propiedad; los clientes no deben enviar `tenant_id`.

Nuevas teclas incluyen `onboarding:write`. Las teclas existentes creadas antes de introducir este alcance pueden utilizar este punto final si tienen `messages:write`.

Punto final:

```http
POST /v1/onboarding/sessions
Authorization: Bearer eh_live_xxx
Content-Type: application/json
```

Solicitud:

```json
{
  "provider": "whatsapp",
  "signup_mode": "cloud_api",
  "return_url": "https://app.example.com/settings/whatsapp",
  "language": "es",
  "metadata": {
    "external_customer_id": "cus_123"
  },
  "expires_in_seconds": 3600
}
```

Parámetros:

| Campo | Necesidad | Significado |
| --- | --- | --- |
| `provider` | no | `whatsapp` (default), `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`. |
| `signup_mode` | no | `cloud_api` para una conexión regular de WhatsApp Business API, o `coexistence` para WhatsApp Business App coexistencia. `cloud_api`. |
| `return_url` | no | URL HTTPS donde la página anfitriona puede enviar al cliente después de la terminación. |
| `language` | no | `es`, `en`, `pt-BR`Defaults to `es`. |
| `metadata` | no | El objeto JSON se hizo eco de nuevo en los juegos web a bordo. |
| `expires_in_seconds` | no | Tiempo de vida desde `300` a `3600` Defaults a una hora. |

Respuesta:

```json
{
  "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
  "session": {
    "id": "session_uuid",
    "status": "pending",
    "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
    "organization": {
      "name": "appcreatorbr",
      "slug": "appcreatorbr",
      "logo_url": "https://project.supabase.co/storage/v1/object/public/organization-logos/tenant/logo.png"
    },
    "signup_mode": "cloud_api",
    "language": "es",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": {
      "external_customer_id": "cus_123"
    },
    "expires_at": "2026-07-11T18:00:00.000Z",
    "opened_at": null,
    "completed_at": null
  }
}
```

Cuando el cliente completa la autorización en la página anfitriona, Easyhook almacena
el canal bajo la organización que posee la clave API.
`onboarding.*` webhooks para recibir eventos de terminación en su aplicación. Sesiones
caduca después de una hora y se consumen después del primer éxito
finalización. La entrega de la compleción se persiste en la caja de salida web de Easyhook y
retried with the same idempotency guarantees as message events.
Incluye: `onboarding.connection` con el canal conectado canónico
`account_id`, nombre de pantalla, proveedor y su referencia de canal Easyhook cuando
ese proveedor utiliza un registro de canales.

Cuando la organización ha subido un logotipo en el portal Easyhook, `organization.logo_url`
se incluye automáticamente y la página anfitriona muestra que marca. Los clientes no envían o
anular el logotipo al crear una sesión.

La página de Easyhook hospedada utiliza estos puntos finales de soporte token-scoped internamente:

| Método | Punto final | Autenticación | Propósito |
| --- | --- | --- | --- |
| `GET` | `/v1/onboarding/sessions/{token}` | Token de sesión pública opaque | Leer / abrir una sesión de a bordo no explorada. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | Token de sesión pública opaque | Intercambia el código de autorización Meta y completa la conexión para la propia organización. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | Token de sesión pública opaque | Telegrama completo, IMAP/SMTP, Messenger o autorización de Instagram. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | Token de sesión pública opaque | Iniciar Gmail, Outlook, Mercado Libre, o TikTok OAuth. |

Las aplicaciones de los clientes normalmente crean una sesión y redirigen al usuario al Easyhook devuelto `url`; no deben recrear el flujo de finalización token de la página anfitriona.

Para Messenger, Easyhook coincide con la página seleccionada contra el activo específico de Meta
`pages_messaging` no sustituye una página diferente que sólo fue
otorgada para comentarios u otro permiso. Si la terminación devuelve
`meta_page_access_unavailable`, Meta autorizó el inicio de sesión de negocios pero no
exponer una credencial de mensajería usable para la página seleccionada. Confirme que
el mismo usuario de Facebook tiene acceso completo a esa página, seleccione en Facebook Acceder para
Negocio, subvención `pages_messaging`, y volver a iniciar la sesión auspiciada.
incluye el mensaje de diagnóstico de Meta cuando esté disponible.

Para crear la misma sesión alojada y enviar inmediatamente su URL de un número de WhatsApp propiedad de la organización API-key, utilice:

```http
POST /v1/onboarding/sessions/send
```

Acepta `from`, `to`, `signup_mode`, `language`, `return_url`, `metadata`, y `expires_in_seconds`. Easyhook envía un mensaje fijo localizado que siempre contiene la URL generada. `body` Los valores son rechazados para evitar el envío de un mensaje sin el enlace. El envío de texto de forma gratuita requiere una ventana de servicio al cliente abierta las 24 horas. La respuesta contiene tanto la sesión de a bordo como el resultado del mensaje enviado.

### Ejemplos de a bordo invitados

Curl:

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "signup_mode": "cloud_api",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" }
  }'
```

TipoScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/onboarding/sessions", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    signup_mode: "cloud_api",
    return_url: "https://app.example.com/settings/whatsapp",
    metadata: { external_customer_id: "cus_123" },
  }),
});

const { url } = await res.json();
```

Python:

```python
import requests

response = requests.post(
    "https://api.easyhook.dev/v1/onboarding/sessions",
    headers={
        "Authorization": f"Bearer {EASYHOOK_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "signup_mode": "cloud_api",
        "return_url": "https://app.example.com/settings/whatsapp",
        "metadata": {"external_customer_id": "cus_123"},
    },
)

url = response.json()["url"]
```

## Identificadores del remitente

Uso `from` como el identificador del remitente visible para el cliente. No use los ids Supabase internos en las integraciones del cliente a menos que esté haciendo una operación portal/admin.

El valor canónico es el `account.id` entregado en Easyhook webhooks. Lo mismo
valor se puede pasar directamente `from`, independientemente del proveedor. `GET /v1/senders`
devuelve cada remitente disponible a la clave API con su canónica `account_id`.
Cada remitente también incluye un `health` query one sender directly with:

```http
GET /v1/senders/{account_id}/health
Authorization: Bearer eh_live_...
```

`health.status` es `connected`, `unreachable`,
`reauthorization_required`, `unknown`. `unreachable` representa un proveedor
o falla de red que puede ser temporal. `reauthorization_required` significa que
activos de crédito o proveedor ya no es utilizable y el cliente debe volver a conectar
ese canal. `checked_at`, `code`, y el sanitized `message` se incluyen para
diagnóstico; credenciales y fichas de proveedor nunca se devuelven.

Para el monitoreo basado en empuje, suscríbete un webhook cliente
`channel.health_changed`. Easyhook emite sólo cuando la salud normalizada
cambios estatales, no después de cada cheque periódico.

Para desconectar un remitente sin abrir el portal Easyhook, código URL que
valor canónico y llamada:

```http
DELETE /v1/senders/{account_id}
Authorization: Bearer eh_live_...
```

Respuesta de ejemplo:

```json
{
  "ok": true,
  "provider": "instagram",
  "account_id": "17841400000000001",
  "disconnected": true,
  "secret_removed": true
}
```

La operación es organización-scopio e idempotente. Repetirlo después del remitente
ya se han eliminado las devoluciones `200` con `already_disconnected: true`.
Easyhook elimina su canal almacenado y sus credenciales; activos del lado proveedor y
las cuentas de negocio no se eliminan.

Esta operación REST es el contrato de automatización soportado. También está disponible
en el portal API explorer como una solicitud copiable, pero la ejecución permanece desactivada
para evitar una prueba destructiva accidental.

Para WhatsApp, utilice la identificación del número de teléfono Meta desde `account.id`:

```json
{ "from": "123456789012345" }
```

El número de teléfono de negocios conectado sigue siendo aceptado para comodidad:

```json
{ "from": "15550100001" }
```

Para Messenger, Instagram y Telegram, utilice el proveedor nativo `account.id`:

```json
{ "from": "123456789012346" }
```

```json
{ "from": "17841400000000001" }
```

```json
{ "from": "SELLER_ID" }
```

Reglas:

- Para los números de teléfono de WhatsApp, siempre incluye el código internacional de llamadas. Easyhook acepta
  E.164 (E.164)`+57 300 000 0000`) y dígitos-sólo (`573000000000`) valores, más común
  formateo con espacios, hyphens, puntos, paréntesis, o los `00`
  prefijo internacional.
- Un receptor de WhatsApp también puede ser el BSUID opaco recibido en `contact.user_id`,
  `message.from_user_id`, `status.recipient_user_id`. Pásalo sin cambios
  Easyhook `to`; no añadir `+`, eliminar puntuación, o validarla como E.164.
  Easyhook envía números de teléfono a Meta en `to` BSUID/parent-BSUID valores en
  Meta's dedicated `recipient` campo.
- No enviar números solos a nivel nacional. Easyhook no adivina un país porque
  los mismos dígitos principales pueden identificar un código de llamadas de país válido diferente.
- El `from` el remitente debe pertenecer al organización que posee la clave API.
- Los nombres de usuario de Instagram se pasan sin un líder `@`. Uso `example_business`, no `@example_business`.
- Legacy aliass such as `page_<PAGE_ID>`, `ig_<INSTAGRAM_ID>`, y
  `telegram_<BOT_ID>` seguir siendo aceptado, pero las nuevas integraciones deben mapear
  `account.id` directamente.
- Si el organización de clave API no posee el remitente, Easyhook devuelve
  `channel_or_phone_not_found` o `phone_not_found` sin exponer a otro
  datos de la organización.
- Legacy `phone_id`, `waba_id`, y `channel_id` entradas de estilo todavía se aceptan cuando se documenta para la compatibilidad interna/de atrás, pero los ejemplos de clientes externos deben utilizar `from`.
- México: `+52 55 0000 0001`, `525500000001`, `+52 1 55 0000
  0001`, and `5215500000001` resuelven la misma identidad de WhatsApp.
- Argentina: entrada móvil común, como `+54 11 15 2345 6789` se normaliza
  a su identidad móvil internacional (`5491100000000`).
- El mismo parser abarca los países y territorios de la NANP y el resto de latinos
  América; no se aplica ningún defecto específico para cada país.

Ejemplos aceptados para WhatsApp:

```json
{ "from": "+57 300 123 4567", "to": "00 54 9 11 2345-6789" }
```

```json
{ "from": "5511000000000", "to": "+56 9 0000 0000" }
```

## Ventana de servicio al cliente

Mensajes de forma gratuita (`text` y período de sesiones `media`) sólo se permiten dentro de la ventana de servicio al cliente 24 horas de WhatsApp.

Si la ventana está cerrada, Easyhook vuelve:

```json
{ "error": "customer_service_window_closed", "allowed_message_type": "template" }
```

Si Easyhook no puede encontrar un contacto coincidente o un evento de entrada reciente para el `to` valor, el mismo error incluye una razón de diagnóstico:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "reason": "recipient_not_found_or_no_recent_inbound_message",
  "hint": "Check the recipient country code or WhatsApp ID. Free-form text/media requires an inbound message in the last 24 hours; otherwise send an approved template."
}
```

Las plantillas se pueden enviar fuera de la ventana de 24 horas cuando se aprueba la plantilla y se satisfacen los requisitos de opción.

### 72 horas punto de entrada libre

WhatsApp puede abrir una ventana de 72 horas de acceso libre cuando un cliente inicia la conversación desde un anuncio de Click-to-WhatsApp elegible o Facebook Page call-to-action y las respuestas del negocio dentro del tiempo requerido de Meta.

Esta ventana está separada de la ventana de servicio al cliente las 24 horas:

- La ventana de 24 horas controla si se puede enviar texto de forma gratuita, medios de comunicación, mensajes interactivos y flujos.
- La ventana de 72 horas de entrada libre afecta a Meta pricing. No extiende los permisos de envío de forma gratuita.
- Después de las primeras 24 horas, Easyhook sigue requiriendo una plantilla aprobada y un consentimiento válido incluso cuando la ventana de punto de entrada libre todavía está activa.
- Easyhook no abre la ventana de 72 horas solo desde la referencia de entrada. Espera un Webhook de estado Meta. Utiliza `conversation.expiration_timestamp` cuando se suministra, y también es compatible con los ajustes de precios actuales por mensajería identificados por `pricing.type = free_entry_point`.

Referencias oficiales Meta: [Contexto de referencia y objeto webhook](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object) y [reclamación de estado de entrada libre](https://www.postman.com/meta/whatsapp-business-platform/request/85iyhv5/status-message-sent-business-reply-to-user).

Cuando un envío de forma gratuita es rechazado mientras que esta ventana de precios existe, la respuesta incluye:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "window_expires_at": "2026-07-11T10:00:00.000Z",
  "free_entry_point": {
    "active": true,
    "expires_at": "2026-07-13T10:01:00.000Z",
    "conversation_id": "conversation_123",
    "note": "This window affects Meta pricing only. Approved templates are still required outside the 24-hour customer service window."
  }
}
```

## Entrega programada

Mensaje enviar endpoints aceptar un opcional `at` campo:

- `POST /v1/messages/text`
- `POST /v1/messages/media`
- `POST /v1/messages/template`

`at` debe ser una fecha/hora ISO 8601. Si incluye `Z` o un offset, Easyhook respeta esa zona horaria. Si no se incluye una zona horaria, Easyhook trata el valor como UTC.

Ejemplos:

```json
{ "at": "2026-07-02T18:30:00-06:00" }
```

```json
{ "at": "2026-07-03T00:30:00Z" }
```

```json
{ "at": "2026-07-03T00:30:00" }
```

Comportamiento de programación:

- Sin `at`, el punto final envía inmediatamente.
- Con `at`, Easyhook almacena el mensaje y programa un envío de tareas en la nube para ese tiempo.
- La respuesta es `202 Accepted` con una `scheduled_message.id`.
- `client_reference` es un identificador de aplicación opcional de hasta 200 caracteres. Easyhook lo devuelve en el ciclo de vida programado y en los juegos web correlacionados.
- Enviar un establo `Idempotency-Key` encabezado al crear un mensaje programado. Retrying the same operation devuelve el registro original en lugar de crear otra tarea de Cloud.
- Programado de forma gratuita `text` y `media` debe estar dentro de la ventana de servicio al cliente 24 horas de WhatsApp en el momento programado.
- Las plantillas programadas pueden estar fuera de la ventana de servicio al cliente las 24 horas, pero deben seguir utilizando plantillas aprobadas y satisfacer los requisitos de opt-in.
- Si un mensaje de forma gratuita programado estaría fuera de la ventana, Easyhook vuelve `scheduled_customer_service_window_closed`.
- Los errores de programación exponen `retryable`, `delivery_state`, y `fallback_allowed`. Únicamente utilizar un camino de entrega alternativo cuando `fallback_allowed` es `true`; un `unknown` el estado de entrega puede haber llegado a Meta.

Ejemplo de respuesta programada:

```json
{
  "ok": true,
  "scheduled": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_text",
    "status": "scheduled",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-02T18:00:00.000Z"
  }
}
```

### Reconcilo Mensaje programado

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Requisitos `messages:read`; existente `messages:write` Las teclas siguen siendo compatibles. Utilice este punto final después de los timeouts, los registros de trabajadores, o el tiempo de inactividad webhook.

```bash
curl https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

Después de que Easyhook envíe el mensaje, `message_id` Contiene el WAMID de Meta. `provider_status` avanza independientemente como Meta reporta `sent`, `delivered`, `read`, `failed`.

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "delivered",
    "provider_status_at": "2026-07-03T00:30:03.000Z",
    "sent_at": "2026-07-03T00:30:01.000Z",
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-03T00:30:03.000Z"
  }
}
```

Las fallas de ejecución de la terminal exponen si la operación puede ser retrenada y si una plantilla es segura:

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "failed",
    "error": {
      "code": "customer_service_window_closed",
      "retryable": false,
      "delivery_state": "not_sent",
      "fallback_allowed": true
    }
  }
}
```

`delivery_state: unknown` significa que Easyhook no puede probar que el proveedor rechazó el intento. No enviar un inconveniente automáticamente. `fallback_allowed: true` sólo se devuelve cuando Easyhook sabe que el mensaje original de forma gratuita no fue enviado y una plantilla aprobada puede ser intentado.

### Cancelar Mensaje programado

Punto final:

```http
DELETE /v1/scheduled-messages/{scheduled_message_id}
```

Requiere `messages:write`. La cancelación está limitada a la organización de la clave de API. Sólo se pueden cancelar mensajes cuyo estado aún sea `scheduled`.

Ejemplo:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

Respuesta al éxito:

```json
{
  "ok": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "cancelled"
  }
}
```

## Metadatos de contacto de WhatsApp

Utilice este punto final para crear o actualizar un nombre de contacto almacenado por Easyhook para el
WABA resolvió `from`:

```http
PUT /v1/contacts
```

```bash
curl -X PUT https://api.easyhook.dev/v1/contacts \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: crm-contact-15550100004-v3" \
  -d '{
    "from": "123456789012345",
    "contact": "15550100004",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "target": "easyhook"
  }'
```

`from` acepta el teléfono conectado o Meta Phone Number ID. `contact` acepta
un identificador de teléfono internacional WhatsApp o un BSUID opaco. Easyhook
resuelve el contacto dentro del WABA detrás `from`; nunca se comparten contactos
entre organizaciones o WABAs. Al menos uno de `full_name` o
`preferred_name` es necesario.

`target` es requerido por lo que el callador no puede confundir los dos tipos de escritura:

- `easyhook`: actualizar sólo los metadatos de contacto locales de Easyhook.
  emisores `contact.updated`; repetir el mismo estado es un no-op.
- `provider`: solicitar una escritura real al libro de direcciones de WhatsApp Business App.
  Meta no expone actualmente esa operación, por lo que Easyhook vuelve HTTP 422
  con `provider_contact_write_unsupported` y no cambia nada localmente.

```json
{
  "ok": true,
  "changed": true,
  "target": "easyhook",
  "provider_contact_book_updated": false,
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": {
    "id": "15550100004",
    "phone": "15550100004",
    "user_id": null,
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "name": "Ana",
    "updated_at": "2026-08-12T18:30:00.000Z"
  }
}
```

Esta limitación es distinta de dos características Meta soportadas: enviar un
tarjeta de contacto como un mensaje de WhatsApp y recibir contacto originario del proveedor
cambios a través de `smb_app_state_sync`. Tampoco es una API de Cloud escribir en
WhatsApp Business App address book. Ver el funcionario de Meta [contact-message
solicitud](https://www.postman.com/meta/whatsapp-business-platform/request/e9dulgq/send-contact-message)
y [SMB App State Sync webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

## Consentimiento: Opt-In / Opt-Out

Para los mensajes de plantilla iniciados por el negocio, Easyhook requiere que el contacto tenga
opt-in grabado en Easyhook. El opt-in puede provenir del flujo de WhatsApp gestionado
o desde `POST /v1/consent` cuando el cliente recogió permiso auditable en
otro sistema. Facilitar el consentimiento gestionado de la WABA sólo es necesario para enviar el
Easyhook opt-in o opt-out Flow; no es necesario para el registro externo
consentimiento.

Si el contacto no ha optado y el flujo gestionado está habilitado, Easyhook
Devoluciones:

```json
{ "error": "opt_in_required", "required_action": "send_consent_flow" }
```

Si el flujo gestionado está deshabilitado, `required_action` es `record_opt_in`. API
clientes pueden registrar el consentimiento a través de `POST /v1/consent` o permitir el consentimiento gestionado
y enviar el Flujo. `consent_not_enabled` es devuelto sólo cuando un cliente trata de
enviar el consentimiento de Easyhook Flujo mientras que la función WABA está deshabilitada.

El registro Easyhook es una salvaguardia operativa, no un sustituto del permiso válido. El cliente sigue siendo responsable de recoger el consentimiento veraz, explícito y auditable bajo Meta policy y ley aplicable. Configure Meta billing por separado en [WhatsApp Manager](https://business.facebook.com/latest/settings/whatsapp_account); la billetera Easyhook no paga los cargos de plantilla de Meta. Ver Meta 's [opt-in guidance](https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in/) y [documentación de precios](https://developers.facebook.com/docs/whatsapp/pricing/).

Si se opta por un contacto, Easyhook bloquea la plantilla iniciada por el negocio envía con `recipient_opted_out`. Los mensajes de texto, medios de comunicación y flujo de forma gratuita todavía se permiten cuando el contacto tiene una ventana de servicio al cliente abierta las 24 horas, porque el contacto inició esa sesión.

Easyhook registra el consentimiento automáticamente cuando una presentación de WhatsApp Flow incluye estos campos booleanos:

| Campo | Significado |
| --- | --- |
| `service_opt_in` | El contacto optó por los mensajes de servicio/utilidad. |
| `marketing_opt_in` | El contacto optó por los mensajes de marketing. |
| `service_opt_out` | El contacto optó por salir de los mensajes de servicio/utilidad. |
| `marketing_opt_out` | El contacto optó por salir de los mensajes de marketing. |

Frases de exclusión claras como `Ya no quiero recibir mensajes`, `dame de baja`, `no me contactes`, `stop`, `unsubscribe`, o el tipo común `unsuscribe` Si el consentimiento de WABA es activo, Easyhook registra una solicitud pendiente de exclusión y envía la opción publicada WhatsApp Flow para que el contacto pueda confirmar si quieren parar los mensajes de servicio, mensajes de marketing o ambos. El consentimiento efectivo existente permanece invariable hasta que se presente el flujo. Una solicitud no confirmada expira después de una hora y puede ser solicitada de nuevo. `custom_keywords` sólo añade frases específicas para el negocio.

### Opcional opción automática

Set `auto_opt_in_enabled` a `true` al habilitar o actualizar la configuración de WABA para programar el flujo opt-in 23 horas después de la primera interacción en vivo de un contacto con ese número de WhatsApp.

- La opción está deshabilitada por defecto y se aplica por WABA.
- Una solicitud automática se crea por contacto y número de remitente.
- Las importaciones de historia nunca lo programan.
- En el momento de envío Easyhook revalida que el consentimiento permanece habilitado, el contacto no ha optado ni optado por salir, y la ventana de servicio de 24 horas todavía está abierta.
- Si falla algún cheque, Easyhook cancela la tarea sin enviarla.
- Esta automatización interna no cuenta como una llamada de API de clientes. Los propios cargos y políticas de mensajería de Meta siguen siendo aplicables.

### Enable WABA Consentimiento

Punto final:

```http
POST /v1/consent/enable
```

Requisitos `flows:write`.

Esto crea o reutiliza dos flujos versionados para el WABA, los publica, y marca el consentimiento WABA como activo:

| Nombre de flujo | Propósito |
| --- | --- |
| `easyhook_consent_preferences_<revision>_opt_in` | Recoger el servicio/utilidad y la comercialización opt-in. |
| `easyhook_consent_preferences_<revision>_opt_out` | Confirme el servicio/utilidad y el desvío de marketing. |

Los dos flujos son activos Meta separados por lo que la experiencia opt-in sólo muestra opciones opt-in, y la experiencia de exclusión sólo muestra opciones de exclusión. Meta Flows son inmutables después de la publicación. Llamar a este punto final con copia modificada crea una nueva revisión determinista; copia no cambiada reutiliza la revisión actual.

```bash
curl -X POST https://api.easyhook.dev/v1/consent/enable \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "es",
      "business_name": "Clínica Acme",
      "opt_in_message_body": "Revisa qué mensajes quieres recibir de {business_name}.",
      "opt_in_message_cta": "Confirmar preferencias",
      "opt_in_screen_title": "Preferencias de comunicación",
      "opt_in_heading": "Confirma tus preferencias",
      "opt_in_body": "Elige qué mensajes quieres recibir.",
      "opt_out_message_body": "Administra los mensajes que recibes de {business_name}.",
      "opt_out_message_cta": "Administrar preferencias",
      "opt_out_screen_title": "Preferencias de comunicación",
      "opt_out_heading": "Dejar de recibir mensajes",
      "opt_out_body": "Elige qué mensajes quieres cancelar.",
      "footer": "Puedes cambiar estas preferencias después."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel my reminders"]
  }'
```

### Consiga el Config de Consentimiento de WABA

```http
GET /v1/consent/config?from=15550100001
```

Requisitos `flows:read`. Acepta también `waba_id` o `phone_id` para el uso legado/admin.

### Actualizar el Config de Consentimiento de WABA

```http
PATCH /v1/consent/config
```

Requisitos `flows:write`. Utilice esto para guardar la copia y añadir palabras claves de exclusión específicas para el cliente. Las palabras claves de optimización Easyhook fijadas todavía se aplican. `language` acepta `es`, `en`, `pt-BR` y controla etiquetas administradas por Easyhook.

El mensaje y la copia de forma son intencionadamente separados:

| Campos | Donde aparecen |
| --- | --- |
| `opt_in_message_body`, `opt_out_message_body` | burbuja de mensaje que abre el flujo. `{business_name}`. |
| `opt_in_message_cta`, `opt_out_message_cta` | Botón en esa burbuja del mensaje. |
| `opt_in_screen_title`, `opt_out_screen_title` | Top bar del Flow abierto. |
| `opt_in_heading`, `opt_out_heading` | Dirigiéndose dentro del formulario. |
| `opt_in_body`, `opt_out_body` | Explicación dentro de la forma. |
| `footer` | Capción en la parte inferior de la forma. |

Configuraciones más antiguas que sólo tienen `opt_in_body` o `opt_out_body` mantener su comportamiento de envío anterior hasta que se guarde con los nuevos campos de mensajes.

La configuración de ahorro no muta un Meta Flow publicado. `POST /v1/consent/enable` después de cambiar la copia para crear y activar la versión correspondiente.

```bash
curl -X PATCH https://api.easyhook.dev/v1/consent/config \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "en",
      "business_name": "Acme Clinic",
      "opt_in_message_body": "Review the messages you want to receive from {business_name}.",
      "opt_in_message_cta": "Confirm preferences",
      "opt_in_screen_title": "Communication preferences",
      "opt_in_heading": "Confirm your preferences",
      "opt_in_body": "Choose which messages you want to receive.",
      "opt_out_message_body": "Manage the messages you receive from {business_name}.",
      "opt_out_message_cta": "Manage preferences",
      "opt_out_screen_title": "Communication preferences",
      "opt_out_heading": "Stop messages",
      "opt_out_body": "Choose which messages you no longer want to receive.",
      "footer": "You can change these preferences later."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel reminders", "stop promos"]
  }'
```

### Send Consentimiento Flujo

Punto final:

```http
POST /v1/consent
```

Requisitos `messages:write`. Este es un mensaje de WhatsApp Flow, por lo que requiere una ventana abierta de servicio al cliente las 24 horas.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "mode": "opt_in",
    "body": "Optional message override for this send",
    "cta": "Review"
  }'
```

Permiso `mode` valores: `opt_in`, `opt_out`.

`body` y `cta` son opcionales per-send overrides. Si omitido, Easyhook utiliza el correspondiente `copy.opt_*_message_body` y `copy.opt_*_message_cta` valores de la configuración de consentimiento de WABA. No modifican la forma Flow publicada.

`opt_in` envía `easyhook_consent_preferences_opt_in`. `opt_out` envía `easyhook_consent_preferences_opt_out`.

La WABA debe tener el consentimiento habilitado y la ventana de servicio al cliente debe estar abierta. `accepted: true`, `delivery_status: "pending"`, y `wamid`: esto significa que Meta aceptó la solicitud de flujo, no que el dispositivo lo mostró. `status.*` y correlacionado por `wamid` para observar `sent`, `delivered`, `read`, `failed`.

### Consentimiento de grabación manualmente

Punto final:

```http
POST /v1/consent
```

Requisitos `messages:write`.

Utilice esto cuando el cliente recogió evidencia opt-in/opt-out fuera de Easyhook, por ejemplo con su propio formulario web, acción CRM, o WhatsApp Flow personalizado.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "scope": "marketing",
    "status": "opt_in",
    "source": "customer_form",
    "evidence": {
      "form_id": "form_123",
      "accepted_at": "2026-07-02T18:00:00.000Z"
    }
  }'
```

Permiso `scope` valores: `service`, `marketing`.

Permiso `status` valores: `opt_in`, `opt_out`, `pending_opt_out`.

An `opt_in` registro debe incluir no vacío `evidence`. Almacenar suficiente información
para demostrar lo que la persona aceptó y cuándo, como una versión de formulario,
timetamp, fuente URL, o la comunicación externa id. Easyhook almacena la evidencia
y aplica el estado de consentimiento resultante; no certifica que la colección
método satisfies Meta política o derecho local. La organización utilizando la API
sigue siendo responsable de obtener el consentimiento válido y honrar las solicitudes de exclusión.

### Obtener contacto con el estado de consentimiento

```http
GET /v1/consent/status?from=123456789012345&contact=15550100002
```

Requisitos `messages:read`. Para compatibilidad atrasada, las claves de API creadas antes
este alcance de lectura que existe puede utilizar `messages:write`. `from` acepta el conectado WhatsApp `account.id`,
Número de teléfono, o número de teléfono de negocios. El contacto se resuelve dentro del
WABA detrás de ese remitente; nunca se comparten contactos y consentimiento entre WABAs.
`to` y `recipient` se aceptan como alias para `contact`.

```bash
curl -X GET 'https://api.easyhook.dev/v1/consent/status?from=123456789012345&contact=15550100002' \
  -H "Authorization: Bearer eh_live_xxx"
```

```json
{
  "consent": {
    "contact": "15550100002",
    "account": { "id": "123456789012345" },
    "service": {
      "status": "opt_in",
      "updated_at": "2026-07-30T18:00:00.000Z",
      "source": "whatsapp_flow",
      "pending_opt_out": true,
      "pending_opt_out_at": "2026-08-01T05:30:00.000Z",
      "pending_opt_out_expires_at": "2026-08-01T06:30:00.000Z"
    },
    "marketing": {
      "status": "opt_out",
      "updated_at": "2026-07-31T18:00:00.000Z",
      "source": "customer_api"
    }
  }
}
```

Cada alcance devuelve el estado efectivo: `opt_in`, `opt_out`, `unknown`.
`unknown` significa que Easyhook no tiene elección registrada para ese alcance; no
significa que la persona optó por entrar. `pending_opt_out` es metadatos separados y lo hace
no reemplazar a un confirmado `opt_in`; sigue siendo `true` por lo menos una hora
Easyhook espera la confirmación de flujo. La evidencia está intencionalmente excluida de esto
read endpoint. Subscribe to `consent.updated` para recibir cambios sin
encuestando.

## Errores

Errores comunes:

| Error | Significado |
| --- | --- |
| `invalid_api_key` | Desaparecido, inválido, revocado o la clave de API insuficiente. |
| `tenant_id_not_allowed` | Solicitud de API pública incluida `tenant_id`; el organización viene de la clave de API. |
| `missing_required_fields` | Faltan campos obligatorios de carga útil. |
| `phone_not_found` | El `from` el número no está conectado a la organización que posee la clave de API. `from` como el campo inválido e incluye una pista correctiva. |
| `channel_or_phone_not_found` | El punto final de envío unificado no podría resolver `from` como número de WhatsApp o alias de canal conectados a la organización clave de API. |
| `channel_not_enabled` | `from` resuelto a un canal no WhatsApp que no está habilitado para el envío público todavía. |
| `unsupported_message_type` | El punto final no admite el tipo de mensaje solicitado. |
| `invalid_whatsapp_recipient` | El punto final unificado resolvió WhatsApp, pero `to` no es un teléfono internacional válido ni un opaque válido WhatsApp BSUID. |
| `phone_or_template_not_found` | La plantilla seleccionada no podría ser resuelta para el WABA detrás `from`. |
| `phone_or_flow_not_found` | El flujo seleccionado no podría ser resuelto para el WABA detrás `from`. |
| `template_not_approved` | La plantilla existe pero no es aprobada por Meta. |
| `flow_not_published` | El Flujo existe localmente pero no se publica en Meta, por lo que no puede ser enviado. |
| `consent_not_enabled` | El consentimiento gestionado de WABA Flow no ha sido activado; hazlo antes de intentar enviar ese Flujo. |
| `opt_in_required` | Plantilla envía las necesidades conocidas opt-in registradas en Easyhook. |
| `recipient_opted_out` | Easyhook tiene el destinatario marcado como excluido, por lo que las plantillas iniciadas por el negocio están bloqueadas. |
| `customer_service_window_closed` | El texto/media de forma gratuita está bloqueado fuera de la ventana de 24 horas. Si no existe ningún contacto coincidente o evento de entrada reciente, la respuesta incluye `reason: "recipient_not_found_or_no_recent_inbound_message"`. |
| `scheduled_customer_service_window_closed` | El texto/media de forma gratuita programada estaría fuera de la ventana de 24 horas `at`; la respuesta ha `delivery_state: "not_sent"` y permite el retroceso de la plantilla. |
| `conversation_policy_temporarily_unavailable` | Easyhook no pudo verificar la ventana de servicio de WhatsApp debido a una falla temporal de la base de datos. `retryable: true`, `delivery_state: "not_sent"`, y `request_id`; reingresar en breve utilizando el mismo `Idempotency-Key`. |
| `insufficient_balance` | La cartera de la organización no tiene suficiente equilibrio para la operación. Recargarlo antes de volver a entrar. |
| `scheduled_message_create_failed` | Easyhook no podía persistir ni prever el horario; inspeccionar `retryable`, `delivery_state`, y `fallback_allowed` antes de volver a intentarlo. |
| `scheduled_delivery_not_configured` | La entrega programada no está configurada para esta implementación de backend. |
| `scheduled_message_not_cancellable` | El mensaje programado ya está procesando, enviado, fallado o cancelado. |
| `meta_send_failed` | Meta rechazó la solicitud de envío; la respuesta incluye detalles sanitized Meta. |

## Texto deprecado Alias

Punto final:

```http
POST /v1/messages/send
```

Esta compatibilidad, alias, resuelve `from` contra el organización de API-key y retornos
el `Deprecation: true` encabezado de respuesta. Nuevas integraciones utilizan
`POST /v1/messages/text`.

Comportamiento público actual:

- El texto WhatsApp está habilitado.
- Mensajero e Instagram texto están habilitados cuando `from` resuelve a un canal conectado activo para el organización de clave API.
- Los puntos finales existentes de WhatsApp siguen soportados para la compatibilidad atrasada.

Campos obligatorios para texto WhatsApp:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Número de teléfono WhatsApp propiedad del arrendatario o alias del canal Messenger/Instagram. |
| `to` | cuerda | Número de destinatarios WhatsApp, Messenger PSID, o Instagram IGSID. |
| `type` | cuerda | Opcional. `text`; actualmente sólo `text` es compatible. |
| `body` | cuerda | Texto del mensaje. |

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/send \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"text","body":"Hola desde Easyhook"}'
```

Respuesta al éxito:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Ejemplos comunes

Establecer estas variables una vez:

```bash
export EASYHOOK_API_KEY="eh_live_xxx"
export EASYHOOK_FROM="15550100001"
export CUSTOMER_WA="15550100002"
```

### Enviar texto WhatsApp

Curl:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Hola desde Easyhook\"
  }"
```

Python:

```python
import os
import requests

resp = requests.post(
    "https://api.easyhook.dev/v1/messages/text",
    headers={
        "Authorization": f"Bearer {os.environ['EASYHOOK_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "from": os.environ["EASYHOOK_FROM"],
        "to": os.environ["CUSTOMER_WA"],
        "body": "Hola desde Easyhook",
    },
    timeout=20,
)
resp.raise_for_status()
print(resp.json())
```

TipoScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/messages/text", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.EASYHOOK_FROM,
    to: process.env.CUSTOMER_WA,
    body: "Hola desde Easyhook",
  }),
});

if (!res.ok) throw new Error(await res.text());
console.log(await res.json());
```

### Programar un mensaje de texto

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Recordatorio programado\",
    \"at\": \"2026-07-07T13:10:00-06:00\"
  }"
```

Cancelarlo:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

### Enviar una plantilla

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"template\": {
      \"name\": \"order_ready\",
      \"language\": \"en_US\"
    },
    \"parameters\": {
      \"body\": [\"Example User\"]
    }
  }"
```

### Subir medios reutilizables y enviar por nombre

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"name\": \"promo_july\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"

curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"type\": \"image\",
    \"media_name\": \"promo_july\",
    \"caption\": \"Promo de julio\"
  }"
```

### Enviar cada WhatsApp Media Tipo por nombre reutilizable

```bash
# Image
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"image\",\"media_name\":\"promo_image\",\"caption\":\"Image caption\"}"

# Video
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"video\",\"media_name\":\"promo_video\",\"caption\":\"Video caption\"}"

# Audio
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"audio\",\"media_name\":\"intro_audio\"}"

# Document
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"document\",\"media_name\":\"price_list\",\"filename\":\"prices.pdf\",\"caption\":\"Price list\"}"

# Sticker
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"sticker\",\"media_name\":\"thanks_sticker\"}"
```

### Enviar un flujo de consentimiento

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"mode\": \"opt_in\"
  }"
```

### Enviar un flujo de WhatsApp personalizado

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"flow_name\": \"lead_capture\",
    \"body\": \"Complete your information.\",
    \"cta\": \"Open form\",
    \"flow_token\": \"lead_123\"
  }"
```

### Minimal n8n HTTP Solicitud de configuración

Uso:

| n8n campo | Valor |
| --- | --- |
| Método | `POST` |
| URL | `https://api.easyhook.dev/v1/messages/template` |
| Autenticación | Bearer Auth |
| Tipo de contenido del cuerpo | JSON |

Cuerpo:

```json
{
  "from": "15550100001",
  "to": "15550100002",
  "template": {
    "name": "hello_world",
    "language": "en_US"
  }
}
```

`template.language` se requiere a menos que el nombre de la plantilla sea único en que WABA y Easyhook puedan resolverlo con seguridad.

En el `n8n-nodes-easyhook` nodo comunitario, `Choose From Easyhook` sincroniza las plantillas y listas del remitente seleccionados sólo definiciones aprobadas. `Enter Manually` resuelve la misma definición de su nombre tipo y el idioma seleccionado. Ambas fuentes pueden generar automáticamente campos para el texto del encabezado o los medios, variables corporales, botones de URL dinámicos, cargas de respuesta rápida y valores de código de copia. `Custom Components (JSON)` para enviar componentes Meta crudos en su lugar.

El campo n8n personalizado acepta una matriz de componentes brutos o `{ "components": [...] }`. No incluir `from`, `to`, `template`, `language` porque el nodo los suministra por separado. Los enlaces multimedia deben ser URLs HTTPS públicas, y los parámetros del botón URL contienen sólo el valor variable de plantilla dinámica. Vea el paquete README para ejemplos completos de texto y medios.

## Enviar mensaje de texto

Punto final:

```http
POST /v1/messages/text
```

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Propiedad de los arrendatarios `account.id`, WhatsApp teléfono de negocios, o alias de canal compatibles con retrocesos. |
| `to` | cuerda | WhatsApp teléfono receptor o BSUID, Messenger PSID, Instagram IGSID, Telegram chat id o Mercado Libre destinatario id. |
| `body` | cuerda | Texto del mensaje. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `at` | cuerda | Fecha/hora ISO 8601 para la entrega programada. Apoyado para WhatsApp, Messenger, Instagram, Telegram y Mercado Libre texto. |
| `phone_id` | cuerda | Legacy Easyhook teléfono fila id. Preferencias `from`. |

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","body":"Hola desde Easyhook"}'
```

Respuesta del éxito de WhatsApp:

```json
{ "ok": true, "wamid": "wamid..." }
```

Respuesta del éxito de Non-WhatsApp:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

## Leer, Titular, Responder, Reacción, Y Texto Humanizado

Easyhook expone los mismos puntos finales a través de proveedores y rechaza sin soporte
operaciones explícitamente con HTTP `422 operation_not_supported`. Sin apoyo
las operaciones no son facturadas.

| Proveedor | Leer | Tipificación | Responder | Reacción | Texto humanizado |
| --- | --- | --- | --- | --- | --- |
| WhatsApp | Sí. | Sí. | Sí. | Sí. | Sí. |
| Mensajero | Sí. | Sí. | Sí. | No. | Sí. |
| Instagram | Sí. | Sí. | Sí. | No. | Sí. |
| Telegram | No. | Sí. | Sí. | Sí. | Sí. |
| Medición de negocios de TikTok | Sí. | Sí. | Sí. | No. | Sí. |
| Gmail, Outlook, IMAP/SMTP | Usar sólo acciones de correo electrónico | No. | Sí. | No. | No. |
| Mercado Libre | No. | No. | No. | No. | No. |

WhatsApp lee recibos e indicadores de escritura requieren una WhatsApp de entrada
mensaje id (`wamid`). Messenger e Instagram usan el mensaje del proveedor id.
La escritura de telegrama requiere el chat de destino id y las reacciones requieren el
Mensaje telegrama id.

Marcar un mensaje como se lee:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/read \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

Mostrar escribiendo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/typing \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

El texto humanizado sólo aplica controles apoyados por el proveedor seleccionado.
ejemplo, Telegram envía una acción de mecanografia pero no fabrica un recibo de lectura.
WhatsApp Cloud API no expone un webhook para escribir al cliente en Easyhook V1.

### Historia de la coexistencia

Los callbacks de historia de la coexistencia se aceptan rápidamente y se procesan asincrónicamente a través de Cloud Tasks. Easyhook persiste pedazos normalizados antes de procesar, funciona en lotes de más de 100 eventos, y trata el Meta message ID como una clave de idempotencia. Sincronización se incluye sin cargo adicional. Sólo un intento activo de sincronización es aceptado por número, mientras que una organización puede procesar dos números simultáneamente; reanudar la solicitud sigue siendo esperada `409 coexistence_sync_in_progress` con el progreso actual.

Los mensajes históricos no ejecutan el consentimiento en vivo manejo de palabras clave o replay Efectos secundarios de la presentación de flujo.

Los mensajes inbound históricos se entregan como `message.received`; mensajes externos históricos se entregan como `message.echo`. Ambos expuestos `message.source: history`, `message.direction`, explícita `message.from` y `message.to`, y los metadatos de sincronización disponibles `message.history`.

El filtro de suscripción es `history.*`, pero cada evento dentro del lote utiliza el público normalizado `type` `message.received` o `message.echo`. El cuerpo de entrega es `{ "type": "sync.batch", "sync": {...}, "events": [...] }`; los lotes contienen en la mayoría de los 100 eventos. Un consumidor debe procesar cada elemento de `events` y deduplicado `message.id`.

Crear la suscripción al cliente webhook con el `history.*` filtro antes de conectar el número de coexistencia o solicitar sincronización si la integración necesita la importación histórica. `POST /v1/meta/whatsapp/phones/coexistence-sync` inicia la sincronización inicial Meta después del consentimiento a bordo. No es una exportación histórica sin restricciones y debe ser utilizado durante la ventana de elegibilidad a bordo de Meta. Una vez completado, utilice la repetición Easyhook en lugar de solicitar la importación de Meta de nuevo.

Durante la coexistencia a bordo, el negocio debe permitir compartir historia en la App Business de WhatsApp y mantener abierta la aplicación mientras comienza la sincronización inicial. `2593109` significa que compartir la historia es deshabilitado; Easyhook normaliza como `type: sync.failed` para `history.*` suscriptores.

Los consumidores reciben un lote Easyhook en lugar de la devolución cruda de Meta. Procesan cada elemento normalizado en `events`. Construir la clave de la conversación `account.id + ":" + (contact.user_id ?? contact.id)`, deduplicado con `message.id`, ordena una conversación `message.timestamp`, y prevenir la lógica auto-reply en vivo cuando `message.source` es `history`. Las entregas son al menos una vez y reingresan hasta cinco veces. WhatsApp puede proporcionar un ID de usuario estable de Business-scoped (BSUID) en lugar de un teléfono; Easyhook lo conserva en `contact.id`/`contact.user_id` y almacena un alias de teléfono cuando Meta suministra uno. El contrato de mapeo completo se documenta en [Customer Webhooks: Historia de la coexistencia](/webhooks#coexistence-history).

El mismo BSUID o elegible padre BSUID puede ser utilizado como Easyhook `to` para lo normal WhatsApp envía. Easyhook lo mapea a Meta's dedicado `recipient` propiedad. autenticación
plantillas que utilizan una sola hoja, cero-tap, o la entrega de códigos de copia todavía requieren un
número de teléfono; Meta puede rechazar un destino BSUID con error `131062`.

Los medios históricos son asincrónicos. El mensaje inicial puede contener `message.media.storage_status: pending`. Si Meta aún expone el archivo, Easyhook emite más tarde `message.media_available` con el mismo `message.id` y una URL protegida de descarga Easyhook. Desaparecido o expirado Meta media nunca bloquea la importación de texto/historia.

Meta Historia cubre hasta aproximadamente 180 días, excluye grupos, y normalmente expone los medios históricos descargables sólo para mensajes recientes (aproximadamente 14 días). No refleja una copia de seguridad móvil completa. `media_mode: metadata`, `recent_media` (predeterminado, excluyendo el vídeo) y `all_recent_media`.

El cuerpo de solicitud del portal es:

```json
{
  "tenant_id": "TENANT_UUID",
  "phone_id": "LOCAL_PHONE_UUID",
  "media_mode": "recent_media"
}
```

Suscriptores `history.*` también recibir `sync.started`, `sync.progress`, `sync.completed`, y `sync.failed`. Las entregas HTTP fallidas reingresan hasta cinco veces y respetan un valor válido `Retry-After`.

Dos operaciones de recuperación están disponibles y sirven diferentes propósitos:

- `POST /v1/webhooks/{id}/replay` retries falló los lotes de entrega ya creados para ese webhook. Acepta opcional `sync_id` y `limit` (máximo 100 lotes fallidos).
- `POST /v1/webhooks/{id}/history-replays` crea una repetición persistente para un número de WhatsApp. Acepta `phone_id`, `replay_type` (`history` o `contacts`), y opcional `max_events` (máximo 100.000). El Webhook debe suscribirse a `history.*` para mensajes o `smb_app_state_sync.*` para contactos.

Sólo se permite una repetición activa de cada tipo por webhook y número. `GET /v1/webhooks/{id}/history-replays/{replay_id}` para `pending`, `processing`, `completed`, `failed`. Los lotes reproducidos contienen `sync.replay: true`Los consumidores deben permanecer indemnizados porque la entrega es al menos una vez.

### Coexistence App State Sync

La misma solicitud de sincronización de coexistencia también pide Meta for WhatsApp Business App datos de contacto/estado. `smb_app_state_sync.*` antes de la sincronización para recibir cada registro importado como un normalizado `contact.updated` evento en curso `contact_update`.

La sincronización del Estado y la historia son complementarias: `smb_app_state_sync.*` lleva actualizaciones de contacto/app, mientras que `history.*` Una reconstrucción de integración tanto los contactos como las conversaciones deben suscribirse a ambos filtros antes de iniciar la sincronización. Ver [Customer Webhooks: Coexistence App State Sync](/webhooks#coexistence-app-state-sync) para la carga útil y las reglas de identidad.

### Reacciones y mensajes de WhatsApp sin soporte

Easyhook recibe reacciones de ambas direcciones:

- Las reacciones de los clientes llegan como webhook público `type: message.received`.
- Las reacciones hechas de la App Business de WhatsApp en la coexistencia llegan como webhook público `type: message.echo`.
- El evento de filtro/debug preciso permanece en el `X-Easyhook-Provider-Event` (encabezado)`message.reaction` o `smb_message_echo.reaction`).
- `message.reaction.message_id` es el proveedor `wamid` del mensaje que se está reaccionando.
- `message.reaction.emoji` contiene el emoji. Una cadena vacía elimina una reacción anterior.

Fragmento de tejido normalizado:

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.HBg...",
      "emoji": "❤️"
    }
  }
}
```

Enviar una reacción:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reaction \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid...",
    "emoji": "👍"
  }'
```

Usar un vacío `emoji` para eliminar la reacción actual.

Enviar una respuesta contextual de texto:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reply \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid.HBg...",
    "body": "Respuesta relacionada con este mensaje"
  }'
```

`message_id` debe ser el ID original del mensaje de WhatsApp. Easyhook verifica que
`from` pertenece a la organización API-key y envía el contexto de mensaje de Meta así
WhatsApp muestra la respuesta citada.

Las notas de vídeo circulares de WhatsApp alcanzan actualmente Cloud API como `message.unsupported` con error `131051` y `unsupported.type: video_note`. Meta no incluye una URL id de medios o descargable en esa carga útil. Easyhook conserva este subtipo en los dispositivos web del cliente y muestra un retroceso en el portal, pero no puede almacenar o reproducir el archivo de vídeo hasta que Meta lo expone a través de Cloud API.

El texto humanizado sigue siendo guardado y entregado como un mensaje normal de texto Easyhook. Sólo cambia el comportamiento pre-send:

1. Easyhook encuentra el último mensaje de entrada desde `to`, a menos `message_id` se proporciona.
2. Easyhook intenta marcar la conversación como leída cuando el proveedor la apoya.
3. Easyhook espera un breve retraso de lectura estimado.
4. Easyhook intenta mostrar el indicador de escritura del proveedor.
5. Easyhook espera un breve retraso estimado de escribir.
6. Easyhook envía el mensaje de texto.

Messenger e Instagram utilizan sus acciones de remitente, Telegram utiliza su acción de mecanografía, y WhatsApp utiliza indicadores de lectura y escritura. Estos controles de presencia son el mejor esfuerzo: si el proveedor rechaza uno, Easyhook todavía envía el texto e informa el resultado en `controls.read` y `controls.typing` como tal `sent`, `failed`, `skipped`.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/humanized-text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Thanks, I just checked it and we can help with that."
  }'
```

Facultativo explícito `message_id`:

```json
{
  "from": "15550100002",
  "to": "15550100003",
  "body": "Thanks, I just checked it and we can help with that.",
  "message_id": "wamid.HBg..."
}
```

Si no existe un mensaje de entrada reciente, Easyhook vuelve:

```json
{
  "error": "latest_inbound_message_not_found",
  "hint": "Send message_id explicitly or wait until Easyhook receives an inbound message from this recipient."
}
```



## Deprecated Multichannel Text Alias

Punto final:

```http
POST /v1/messages/channel/text
```

Este punto final sigue siendo sólo para la compatibilidad y retornos atrasados
`Deprecation: true`. Uso `/v1/messages/text` y, sólo cuando sea necesario, el
explícita `channel` discriminador.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Proveedor de propiedad de arrendatario `account.id`. Se siguen aceptando alias y nombres de usuario de Legacy. |
| `to` | cuerda | El destinatario del proveedor id. Messenger utiliza PSID. Instagram utiliza IGSID. |
| `body` | cuerda | Texto del mensaje. |

Mensajero de ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"123456789012346","to":"PSID_VALUE","body":"Hello from Easyhook"}'
```

Ejemplo Instagram envía:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"17841400000000001","to":"IGSID_VALUE","body":"Hello from Easyhook"}'
```

Respuesta al éxito:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

Notas:

- `/v1/messages/text` Ahora resuelve tanto los teléfonos WhatsApp como los canales conectados Messenger/Instagram a través de `from`.
- Messenger e Instagram envía uso de las reglas de mensajería normales de Meta, incluyendo la ventana de respuesta al cliente.
- Las plantillas de WhatsApp siguen siendo sólo WhatsApp.

## Enviar medios multicanal

Punto final:

```http
POST /v1/messages/channel/media
```

Requisitos `messages:write`. Soporta Mensajero e Instagram medios envían. `/v1/messages/media` es el punto final normalizado preferido para los medios de canal por `id` o `link`.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | alias de canal propiedad de los arrendatarios, alias Page id, mango, alias de id Instagram, nombre de usuario de Instagram o canal conectado id. |
| `to` | cuerda | El destinatario del proveedor id. Messenger utiliza PSID. Instagram utiliza IGSID. |
| `type` | cuerda | `image`, `video`, `audio`, `file`. `document` se normaliza para `file`. |
| `id` o `link` | cuerda | URL de los medios HTTPS ya existentes o HTTPS público. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `filename` | cuerda | Nombre de archivo para archivos/document adjuntos. |

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support-messenger",
    "to": "PSID_VALUE",
    "type": "image",
    "link": "https://example.com/promo.png"
  }'
```

### Subir y enviar medios de canal

Punto final:

```http
POST /v1/messages/channel/media/upload
```

Requisitos `messages:write`. Easyhook almacena el archivo temporalmente, crea una URL de corta duración, lo envía a Messenger o Instagram, y devuelve el local `media_asset_id`.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Mensajero de propiedad de los arrendatarios o alias/id del canal de Instagram. |
| `to` | cuerda | Messenger PSID o Instagram IGSID. |
| `type` | cuerda | `image`, `video`, `audio`, `file`. |
| `file_name` | cuerda | Nombre de archivo original. |
| `file_type` | cuerda | Tipo MIME. |
| `file_base64` | cuerda | Base64 bytes de archivos codificados. |

Ejemplo:

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/messages/channel/media/upload \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"support-messenger\",
    \"to\": \"PSID_VALUE\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

## Subir medios reutilizables

Punto final:

```http
POST /v1/media
```

Sube los medios privados gestionados por Easyhook para la organización que posee la API
clave. Este medio es reutilizable, no expira, y es abordado por un único
`name` dentro de la organización. Los canales conectados compatibles pueden reutilizar
el mismo activo sin subirlo de nuevo.

Cada organización incluye `1 GB` de almacenamiento activo de medios reutilizables.
los medios de comunicación sobre la cuota incluida se factura mensualmente `3 MXN / GB / month`.
La carga de los medios reutilizables no expira y no bloquea `1 GB`; el
la respuesta de la carga incluye la estimación actual de uso de la organización cuando
disponible:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook"
  },
  "storage": {
    "included_bytes": 1073741824,
    "used_bytes": 143211,
    "overage_price_mxn_per_gb": 3,
    "billed_monthly": true
  }
}
```

Requisitos `media:write`.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `name` | cuerda | Nombre único de los medios para esta organización. Usar letras minúsculas, números, `_`, `.`, `-`. |
| `type` | cuerda | `image`, `video`, `audio`, `document`, `sticker`. |
| `file_name` | cuerda | Nombre de archivo original. |
| `file_type` | cuerda | Tipo MIME. |
| `file_base64` | cuerda | Base64 bytes de archivos codificados. |

Límites de carga soportados:

| Tipo | Tipos de MIME aceptados | Tamaño máximo |
| --- | --- | --- |
| `image` | `image/jpeg`, `image/png`, `image/webp` | 5 MB |
| `sticker` | `image/webp` | 5 MB |
| `video` | `video/mp4`, `video/3gpp` | 25 MB |
| `audio` | Cualquiera `audio/*` Tipo MIME | 25 MB |
| `document` | Cualquier documento tipo MIME | 25 MB |

Ejemplo:

```bash
FILE_BASE64="$(base64 -w 0 ./logo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"logo_easyhook\",
    \"type\": \"image\",
    \"file_name\": \"logo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

Respuesta al éxito:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook",
    "channel": "whatsapp",
    "type": "image",
    "mime_type": "image/png",
    "file_name": "logo.png",
    "size_bytes": 143211,
    "sha256": "abc...",
    "retention_policy": "permanent",
    "expires_at": null,
    "download_url": "https://api.easyhook.dev/v1/media/media_asset_uuid/download"
  }
}
```

## Lista de medios reutilizables

Punto final:

```http
GET /v1/media
```

Requisitos `media:read`. Devuelve la biblioteca de medios reutilizables para la API-key
organización. Cada elemento incluye `download_url`, que se puede conseguir con el
misma clave de API.

Ejemplo:

```bash
curl -X GET "https://api.easyhook.dev/v1/media" \
  -H "Authorization: Bearer eh_live_xxx"
```

## Descargar Reusable Media

Punto final:

```http
GET /v1/media/{media_asset_id}/download
```

Requisitos `media:read`. Transmite los bytes almacenados desde el almacenamiento de Easyhook. Esta solicitud no llama a Meta y está destinada a las bandejas de entrada o CRM que necesitan para renderizar los medios de Easyhook. `media_access_logs` para medición de transferencia. Cada organización incluye `10 GB/month` transferencia de medios; transferencia adicional se factura mensualmente `3 MXN/GB`.

Ejemplo:

```bash
curl -L "https://api.easyhook.dev/v1/media/media_asset_uuid/download" \
  -H "Authorization: Bearer eh_live_xxx" \
  --output logo.png
```

El mismo patrón de descarga autenticado se aplica a las URL privadas entregadas en
entrando webhooks:

```bash
curl -L "$EASYHOOK_MEDIA_URL" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  --output inbound-media
```

No exponga la clave de API en el HTML del navegador. Descargar a través de un backend confiable,
n8n credencial, o trabajador del lado del servidor. Una solicitud del navegador desnudo a la URL es
esperaba fracasar porque la entrada de los medios de comunicación de clientes es privada.

## Eliminar los medios reutilizables

Punto final:

```http
DELETE /v1/media/{media_asset_id}
```

Requisitos `media:write`. Elimina el objeto almacenado y marca el activo de los medios como eliminado para que su nombre pueda ser reutilizado para el mismo WABA.

Ejemplo:

```bash
curl -X DELETE https://api.easyhook.dev/v1/media/media_asset_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

## Enviar medios reutilizables por nombre

Punto final:

```http
POST /v1/messages/media
```

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | WhatsApp propiedad de los arrendatarios `account.id` (Meta Número de teléfono ID) o número de teléfono de negocios. |
| `to` | cuerda | Recipiente número de WhatsApp. |
| `type` | cuerda | Tipo de medio: `image`, `video`, `audio`, `document`, `sticker`. |
| `media_name`, `id`, `link` | cuerda | Easyhook reutilizable nombre multimedia, Meta media id, o URL de medios públicos. Se requiere exactamente uno. |

Campos obligatorios para Messenger, Instagram y Telegram:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Proveedor de propiedad de arrendatario `account.id`. |
| `to` | cuerda | Messenger PSID, Instagram IGSID o Telegram chat ID. |
| `type` | cuerda | `image`, `video`, `audio`, `file`. `document` se normaliza para `file` cuando sea necesario. |
| `media_name`, `id`, `link` | cuerda | Nombre de los medios reutilizables de la organización, identificación del proveedor existente o URL de los medios HTTPS públicos. |

Campos opcionales:

| Campo | Aplicaciones a | Descripción |
| --- | --- | --- |
| `caption` | `image`, `video`, `document` | Capción enviada con los medios. |
| `filename` | `document` | Nombre de archivo del documento que se muestra al destinatario. |
| `at` | todo tipo | Fecha/hora ISO 8601 para la entrega programada. |
| `phone_id` | todo tipo | Legacy Easyhook teléfono fila id. Preferencias `from`. |

Notas:

- Los mensajes multimedia WhatsApp son mensajes de sesión y requieren una ventana de servicio al cliente abierta las 24 horas.
- Las pegatinas y el audio no soportan leyendas.
- Las pegatinas WhatsApp deben ser archivos WebP válidos que miden exactamente 512 x 512 px. Easyhook rechaza pegatinas reutilizables con `invalid_sticker_dimensions` antes de enviar o cargar la operación de envío. El error incluye ambos `dimensions` y `expected_dimensions`.
- Preferir medios reutilizables gestionados por Easyhook para envíos repetidos. `id` o `link`.
- Cuándo `media_name` se utiliza, Easyhook crea una URL firmada de corta duración interna y envía esa URL a Meta. Las aplicaciones de los clientes sólo necesitan saber el establo `media_name`.
- `media_name` resuelve un activo reutilizable en toda la organización.
  ser utilizado desde WhatsApp, Messenger, Instagram o Telegram cuando ese proveedor
  soporta el tipo de medio seleccionado.

Ejemplo utilizando un enlace:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","link":"https://example.com/image.png","caption":"Imagen de prueba"}'
```

Ejemplo utilizando medios reutilizables:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","media_name":"promo_image","caption":"Promo"}'
```

## WhatsApp Flows

Los flujos son activos de nivel WABA. Easyhook almacena metadatos de flujo por organización y WABA, luego envía mensajes interactivos de Flows publicados como WhatsApp.

Alcance actual:

- Sincronización/lista Metadatos Flow de Meta.
- Cree un registro básico de flujo en Meta cuando el token WABA lo permita.
- Publish a local Flow llamando a Meta.
- Envíe un Flow publicado dentro de la ventana de servicio al cliente las 24 horas.
- Tienda Flow submissions by `flow_token`.
- Entregar las suscripciones completas de flujo a webhooks cliente `flow.submitted`.
- Handle WhatsApp Flow data-exchange callbacks at `/v1/meta/whatsapp/flows/data`.

El intercambio de datos de flujo de producción requiere `WHATSAPP_FLOW_PRIVATE_KEY` en el backend. La clave puede ser un valor PEM con nuevas líneas escapadas o un PEM con código base64. Cuando se crea un flujo con `endpoint_uri`, Easyhook deriva la llave pública que coincide y la envía a Meta como `public_key`; los clientes no necesitan pegar las teclas manualmente por Flujo. `encrypted_aes_key` / `encrypted_flow_data`, almacena la presentación, y devuelve una respuesta cifrada.

Para Flujos estáticos enviados a través del Webhook de mensaje normal de WhatsApp, Easyhook se analiza `interactive.nfm_reply.response_json`, almacena la presentación, y emite lo mismo `flow.submitted` evento cliente webhook. Los clientes no necesitan analizar Meta's `nfm_reply` váyanse.

Para las llamadas API de clientes en esta sección, el WABA se puede resolver con cualquiera de:

| Campo | Donde | Descripción |
| --- | --- | --- |
| `from` | query/body | Número de teléfono de negocios WhatsApp propiedad de arrendatario. |
| `phone_id` | query/body | Easyhook teléfono fila id. |
| `waba_id` | query/body | Easyhook WABA fila id. |

### Flujos de sincronización

Punto final:

```http
POST /v1/flows/sync
```

Requisitos `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

Respuesta al éxito:

```json
{ "ok": true, "count": 2 }
```

### Flujos de lista

Punto final:

```http
GET /v1/flows?from=15550100001
```

Requisitos `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Crear flujo

Punto final:

```http
POST /v1/flows
```

Requisitos `flows:write`.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `waba_id`, `phone_id`, `from` | cuerda | Resolución de WABA. Preferencia `from` para las integraciones de clientes. |
| `name` | cuerda | Nombre de flujo en Meta. |
| `categories` | string[] | Categorías de Meta Flow. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `flow_json` | objeto | Flow JSON definición, pasó a Meta. |
| `endpoint_uri` | cuerda | Data-exchange endpoint URI cuando el flujo necesita backend callbacks. |

```bash
curl -X POST https://api.easyhook.dev/v1/flows \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "communication_preferences",
    "categories": ["SIGN_UP"],
    "flow_json": {
      "version": "7.1",
      "screens": []
    }
  }'
```

### Publish Flow

Punto final:

```http
POST /v1/flows/{local_flow_id}/publish
```

Requisitos `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/local_flow_uuid/publish \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

### Eliminar el flujo

Punto final:

```http
DELETE /v1/flows/{local_flow_id}
```

Requisitos `flows:write`. Elimina el flujo en Meta y elimina el registro local Easyhook Flow. El WABA se puede pasar en la cadena de consulta o en el cuerpo JSON.

```bash
curl -X DELETE "https://api.easyhook.dev/v1/flows/local_flow_uuid?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Enviar mensaje de flujo

Punto final:

```http
POST /v1/messages/flow
```

Requisitos `messages:write`. Los mensajes de flujo son mensajes interactivos de sesión y requieren una ventana abierta de servicio al cliente las 24 horas.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Número de teléfono de negocios WhatsApp propiedad del arrendatario. |
| `to` | cuerda | Recipiente número de WhatsApp. |
| `flow_id`, `flow_name`, `flow_local_id` | cuerda | Referencia lenta. |
| `body` | cuerda | Cuerpo de mensaje mostrado por encima del CTA. |
| `cta` | cuerda | Texto del botón de flujo. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `flow_token` | cuerda | Tu token de correlación. Easyhook genera uno omitido. |
| `flow_action` | cuerda | Defaults to `navigate`. |
| `flow_action_payload` | objeto | La carga pasa a la acción Flow. |
| `header` | objeto | Opcional Meta objeto de encabezado interactivo. |
| `footer` | cuerda | Texto del pie de página opcional. |

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "flow_name": "communication_preferences",
    "body": "Manage your communication preferences.",
    "cta": "Open preferences",
    "flow_token": "contact_123_preferences"
  }'
```

### List Flow Submissions

Punto final:

```http
GET /v1/flows/{local_flow_id}/submissions?from=15550100001
```

Requisitos `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows/local_flow_uuid/submissions?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

Respuesta al éxito:

```json
{
  "submissions": [
    {
      "id": "submission_uuid",
      "flow_token": "contact_123_preferences",
      "contact_wa_id": "15550100002",
      "action": "complete",
      "screen": "OPT_IN",
      "data": { "service_opt_in": true },
      "created_at": "2026-07-02T20:00:00.000Z"
    }
  ]
}
```

### Flow Submission Webhooks

Para recibir respuestas Flow en tiempo real, cree un Webhook cliente suscrito a:

```json
{
  "scope": { "type": "organization" },
  "events": ["flow.submission.*"],
  "providers": ["whatsapp"]
}
```

Uso `scope: { "type": "phone", "from": "15550100002" }` cuando sólo un número de WhatsApp debe recibir el callback, o utilizar `type: "waba"` con el mismo `from` número para cada número conectado en el WABA. Mensajero e Instagram use `type: "channel"` con un alias de canal. Meta Business Portfolio IDs no son espacios públicos.

Easyhook envía `flow.submitted` después de la presentación se almacena. La carga útil incluye la `flow.token` utilizado al enviar el flujo, los identificadores de flujo, el contacto WhatsApp, y el presentado `flow.data`.

If the submitted `data` contiene `service_opt_in`, `marketing_opt_in`, `service_opt_out`, `marketing_opt_out` como tal `true`, Easyhook también actualiza el estado de consentimiento de contacto y almacena un evento de auditoría con la presentación Flow como evidencia.

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100002"
  },
  "flow": {
    "submission_id": "submission_uuid",
    "name": "easyhook_consent_preferences_opt_in",
    "token": "contact_123_preferences",
    "action": "complete",
    "data": {
      "service_opt_in": true
    }
  }
}
```

### Punto final de intercambio de datos de flujo

Configurar flujos dinámicos de WhatsApp para llamar:

```http
POST /v1/meta/whatsapp/flows/data
```

Este endpoint es llamado por Meta, no por clientes de API de cliente. Easyhook resuelve el `flow_token` generados o suministrados cuando `/v1/messages/flow` fue enviado, luego almacena el envío `data`.

## Meta y Portal Endpoints

Estos puntos finales son parte de las operaciones de Easyhook, a bordo, características de portal o compatibilidad atrasada. Se documentan para que los integradores entiendan lo que pueden ver en los registros, pero no son la superficie preferida para nuevas integraciones de API de clientes.

### Meta Webhook Ingestion

Llamado por Meta solamente:

| Método | Punto final | Propósito |
| --- | --- | --- |
| `GET` | `/v1/meta/whatsapp/webhook` | Meta webhook verificación para WhatsApp. |
| `POST` | `/v1/meta/whatsapp/webhook` | Recibe las cargas de pago de WhatsApp Cloud API, coexistencia, plantilla, estado y Flow webhook. |
| `GET` | `/v1/meta/messaging/webhook` | Meta webhook verificación para mensajería Mensajero/Instagram. |
| `POST` | `/v1/meta/messaging/webhook` | Recibe Messenger e Instagram Messaging webhook payloads. |
| `POST` | `/v1/meta/whatsapp/flows/data` | Recibe callbacks de intercambio de datos encriptados WhatsApp Flow. |

Los clientes no llaman estos puntos finales directamente. Los sistemas de clientes reciben eventos normalizados a través de webhooks del cliente.

### Portal/Operaciones de personal

Estos requieren el token de administración Easyhook y son utilizados por el portal o las operaciones:

| Método | Punto final | Propósito |
| --- | --- | --- |
| `POST` | `/v1/api-keys` | Cree una clave de API organización. |
| `GET` | `/v1/api-keys?tenant_id=...` | Llaves de API de organización de lista. |
| `POST` | `/v1/api-keys/{key_id}/revoke` | Revoque una clave de API de organización. |
| `GET` | `/v1/hooks?tenant_id=...` | Lista de webhooks de clientes. |
| `POST` | `/v1/hooks` | Crear un webhook cliente. |
| `POST` | `/v1/hooks/{hook_id}/pause` | Pausa un webhook cliente. |
| `DELETE` | `/v1/hooks/{hook_id}` | Eliminar un webhook de cliente. |
| `POST` | `/v1/hooks/{hook_id}/history-replays` | Reenviar mensajes de coexistencia almacenados o contactos a un gancho activo en lotes. |
| `GET` | `/v1/hooks/{hook_id}/history-replays/{replay_id}?tenant_id=...` | Lee el progreso de la repetición. |
| `POST` | `/v1/channels/messenger/connect` | Conecta un canal de Facebook Page/Messenger desde un código Meta OAuth. |
| `POST` | `/v1/meta/whatsapp/signup/complete` | Completa el registro integrado de WhatsApp. |
| `POST` | `/v1/meta/whatsapp/connections/adopt` | Adoptar una conexión de WhatsApp existente en un organización. |
| `POST` | `/v1/meta/whatsapp/phones/sync` | Metadatos telefónicos Sync WhatsApp de Meta. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync` | Solicitar WhatsApp Business App historia de coexistencia/sincronización del estado. |
| `GET` | `/v1/meta/whatsapp/phones/coexistence-sync/status?tenant_id=...&phone_id=...` | Lea el último estado de sincronización de la coexistencia para el portal. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync/resume` | Resumir trabajos persistentes fallidos de una sincronización parcial/failada sin volver a conectar el teléfono. |
| `POST` | `/v1/meta/whatsapp/phones/register` | Registrar un teléfono de WhatsApp proporcionado con un PIN de seis dígitos. No utilizar para un número de coexistencia ya de trabajo. |
| `GET` | `/v1/integrations/chatwoot?tenant_id=...` | List portal-gestionged Chatwoot integrations. |
| `POST` | `/v1/integrations/chatwoot` | Proporcionar una caja de entrada de la API de Chatwoot y su suscripción de Easyhook. |
| `DELETE` | `/v1/integrations/chatwoot/{integration_id}` | Desconectar Chatwoot sin eliminar su actual bandeja de entrada/historia. |
| `GET` | `/v1/integrations/chatwoot/{integration_id}/imports?tenant_id=...` | Lea el progreso de importación de contacto/historia. |
| `POST` | `/v1/integrations/chatwoot/{integration_id}/imports` | Comienzo de una `contacts` o `history` importa. |
| `POST` | `/v1/wallet/topups/stripe/checkout` | Cree una salida de Stripe anfitriona para una recarga de billetera MXN o USD. Ruta interna/admin. |
| `POST` | `/v1/billing/stripe/webhook` | Recibir eventos firmados de Stripe Checkout y acreditar la correspondiente cartera de organización. Llamado sólo por Stripe. |

Parámetros clave de Admin API:

| Punto final | Necesidad | Facultativo |
| --- | --- | --- |
| `POST /v1/api-keys` | `tenant_id`, `name` | `environment` (`test` o `live`, predeterminados a `test`), `scopes` array de cadena. Si omitido, Easyhook otorga los alcances del cliente predeterminados. |
| `GET /v1/api-keys` | query `tenant_id` | ninguno |
| `POST /v1/api-keys/{key_id}/revoke` | sendero `key_id`, cuerpo `tenant_id` | ninguno |

Parámetros del portal Chatwoot:

| Punto final | Necesidad | Facultativo |
| --- | --- | --- |
| `GET /v1/integrations/chatwoot` | query `tenant_id` | ninguno |
| `POST /v1/integrations/chatwoot` | `tenant_id`, `base_url`, numérico `account_id`, `api_token`, `channels` array con uno o más `{ sender, provider }` objetos | Por canal `label`; campos heredados de un solo canal `sender`, `provider`, y `name` aceptadas |
| `DELETE /v1/integrations/chatwoot/{integration_id}` | sendero `integration_id`, cuerpo `tenant_id` | ninguno |
| `GET /v1/integrations/chatwoot/{integration_id}/imports` | sendero `integration_id`, consulta `tenant_id` | ninguno |
| `POST /v1/integrations/chatwoot/{integration_id}/imports` | sendero `integration_id`, `tenant_id`, `import_type` (`contacts` o `history`) | ninguno |

El tokenized `/v1/integrations/chatwoot/events/...` y
`/v1/integrations/chatwoot/webhook/...` callbacks son generados y utilizados
servidor a servidor por Easyhook y Chatwoot. Los clientes no deben construir ni llamar
manualmente.

Los parámetros de administración webhook del cliente se documentan en [Customer Webhooks](/webhooks)En resumen, `POST /v1/hooks` acepta `tenant_id`, `name`, `url`, `events`, `providers`, `scope_type`, `scope_ref`, `auth_type`, y `auth_header_name`.

El enrutamiento Webhook utiliza tres filtros separados:

- `providers` elige la familia del canal: `whatsapp`, `messenger`, `instagram`, `*`.
- `scope_type` elige el nivel de activos: `tenant` para toda la organización, `waba` o `phone` para WhatsApp, y `channel` para Messenger/Instagram.
- `events` elige la familia del evento, por ejemplo `message.*`, `status.*`, `template.*`, `flow.submission.*`.
- Mensajero e Instagram mensajes de entrada pueden llegar como `message.text`, `message.image`, `message.video`, `message.audio`, `message.file`. Suscribirse a `message.*` para todos los tipos de mensajes soportados, o para un evento concreto si sólo desea un tipo específico.

El estilo recomendado es mantener al proveedor y al evento separados. Por ejemplo, utilizar `providers: ["messenger"]` con `events: ["message.*"]`, no un patrón de evento prefijado por el proveedor. Los patrones prefijados por el proveedor siguen siendo compatibles con el atraso, pero no son el estilo preferido para las nuevas integraciones.

Meta parámetros de a bordo/admin:

| Punto final | Necesidad | Facultativo |
| --- | --- | --- |
| `POST /v1/channels/messenger/connect` | `tenant_id`, `code`, `redirect_uri` | `page_id` |
| `POST /v1/meta/whatsapp/signup/complete` | `tenant_id`, `code`, `redirect_uri` | `waba_id`, `business_id`, `phone_number_id`, `event`, `signup_mode`, `code_received_at`, `backend_post_started_at`, `client_started_at`, `dialog_redirect_uri`, `oauth_redirect_uri` |
| `POST /v1/meta/whatsapp/connections/adopt` | `tenant_id`, `access_token` | `waba_id`, `business_id`, `phone_number_id`, `request_coexistence_sync` |
| `POST /v1/meta/whatsapp/phones/sync` | `tenant_id`, `phone_id` | ninguno |
| `POST /v1/meta/whatsapp/phones/coexistence-sync` | `tenant_id`, `phone_id` | `media_mode`: `metadata`, `recent_media`, `all_recent_media` |
| `POST /v1/meta/whatsapp/phones/coexistence-sync/resume` | `tenant_id`, `phone_id` | `sync_id`; si se omite, Easyhook utiliza la última sesión |
| `POST /v1/meta/whatsapp/phones/register` | `tenant_id`, `phone_id`, `pin` | `pin` debe contener exactamente seis dígitos |

Las rutas de la cartera de Stripe no se autentican con las claves de API del cliente. El portal verifica que el usuario firmado posee o administra la organización, luego llama la ruta de salida con el token de administración de Easyhook. `tenant_id`, `amount_cents`, `currency`, opcional `customer_email`, `success_url`, y `cancel_url`. Los top-ups MXN van desde `$100` a `$5,000 MXN`; Los top-ups USD varían desde `$10` a `$500 USD`. Easyhook acredita exactamente la cantidad pagada en la moneda fija de la cartera y absorbe las tarifas de procesamiento de Stripe. El webhook verifica el cuerpo de solicitud cruda con `Stripe-Signature` y `STRIPE_WEBHOOK_SECRET`, y sólo pagado `checkout.session.completed` o `checkout.session.async_payment_succeeded` eventos pueden acreditar la billetera. Los IDs de evento y checkout del proveedor hacen idempotente de entrega repetida.

### Legacy WhatsApp Route Aliases

Estas rutas siguen siendo implementadas para compatibilidad portal/backward, pero no se recomiendan para nuevas integraciones. `/v1/messages/*`, `/v1/templates*`, `/v1/flows*`, y `/v1/consent*` rutas en su lugar.

| Familia de la ruta del legado | Familia de ruta preferida |
| --- | --- |
| `/v1/whatsapp/messages/text` | `/v1/messages/text` |
| `/v1/whatsapp/messages/template` | `/v1/messages/template` |
| `/v1/whatsapp/templates`, `/sync`, `/delete` | `/v1/templates`, `/sync`, `/delete` |
| `/v1/whatsapp/flows`, `/sync`, `/{id}/publish`, `/{id}`, `/{id}/submissions` | `/v1/flows` equivalentes |
| `/v1/whatsapp/consent/config`, `/enable` | `/v1/consent/config`, `/enable` |

## Plantillas de lista para un número

Punto final:

```http
GET /v1/templates?from=15550100001
```

`from` Easyhook resuelve el WABA detrás de ese número y sólo devuelve plantillas para ese WABA. Si el organización de clave API no posee el número, la solicitud devuelve solamente las plantillas para ese WABA. `phone_not_found`.

### Solución del remitente y de la WABA

La lista de plantillas, sincronizar, crear, subir medios y eliminar operaciones utilizan el mismo solucionador estricto:

- La clave API fija el límite de la organización.
- Cuándo `from` o `phone_id` está presente, la WABA registrada del remitente es autoritativa.
- Easyhook nunca regresa a otro WABA cuando ese remitente no puede ser resuelto.
- Si. `waba_id` también se suministra, debe identificar el mismo WABA que el remitente.
- Retorno de un conflicto entre el remitente y la ABA `409 sender_waba_mismatch` antes de que Easyhook llame a Meta.
- Un remitente desconocido regresa `404 phone_not_found`; no continúa con `waba_id`.

Las integraciones del cliente deben enviar solamente `from`. El suministro de ambos selectores es útil para la reconciliación, no
para anular el WABA asociado con un teléfono.

Ejemplo:

```bash
curl -X GET "https://api.easyhook.dev/v1/templates?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

`waba_id` sigue siendo aceptada para el uso hereditario/interno, pero las integraciones de los clientes deben preferir `from`.

La respuesta siempre identifica la cuenta del proveedor explícitamente:

```json
{
  "meta_waba_id": "123456789012345",
  "templates": [
    {
      "id": "easyhook-template-uuid",
      "template_id": "987654321098765",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "lang": "es_MX",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL"
    }
  ]
}
```

`meta_waba_id` Es el identificador de WABA estable de Meta. `waba_id`, cuando presente para retroceder
compatibilidad, es el UUID interno de Easyhook y no debe ser enviado a Meta o utilizado como identificador del proveedor.

## Plantillas Sync

Punto final:

```http
POST /v1/templates/sync
```

Requisitos `templates:write`. Tira plantillas de Meta para una WABA y almacena el estado actual, calidad, idioma, categoría y componentes en Easyhook.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from`, `phone_id`, `waba_id` | cuerda | Resolución de WABA. Preferencia `from` para las integraciones de clientes. |

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

La respuesta incluye las plantillas devueltas por Meta después de que su estado local haya sido refrescado:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "count": 1,
  "templates": [
    {
      "id": "1234567890",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "language": "es_MX",
      "category": "UTILITY",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL",
      "components": []
    }
  ]
}
```

## Plantilla de verificación Categoría

Punto final:

```http
POST /v1/templates/classify
```

Requisitos `templates:write`. Enviar `category` y la intención `components`.
Easyhook regresa consejos rápidos y deterministas antes de sumisión:

```json
{
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "Aprovecha 20% de descuento hoy." }
  ]
}
```

Cuando el contenido aparece promocional, la respuesta puede recomendar `MARKETING`
e incluye una advertencia. Este cheque es asesor y nunca reemplaza la final de Meta
clasificación.

## Crear plantilla

Punto final:

```http
POST /v1/templates
```

Requisitos `templates:write`. Crea una plantilla de WhatsApp en Meta y almacena la
copia local. La respuesta incluye `category_advice`; las advertencias no bloquean
sumisión.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from`, `phone_id`, `waba_id` | cuerda | Resolución de WABA. Preferencia `from` para las integraciones de clientes. |
| `name` | cuerda | Nombre de plantilla. Utilice letras minúsculas, números y subrayados. |
| `language` | cuerda | Meta código de idioma, por ejemplo `es_MX` o `en_US`. |
| `category` | cuerda | Meta plantilla de categoría, por ejemplo `UTILITY`, `MARKETING`, `AUTHENTICATION`. |
| `components` | array | Meta plantilla componente array. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `parameter_format` | cuerda | `POSITIONAL` (por defecto) o `NAMED`Easyhook valida y lo envía a Meta. |
| `message_send_ttl_seconds` | Número | Meta Mensaje enviar TTL para las categorías de plantilla soportadas. |

Enviar un establo `Idempotency-Key` header for retry-safe creation. Repita la misma llave y JSON vuelve
el resultado original con `idempotent_replay: true` y no llama a Meta otra vez. Reutilizando una llave con diferente
Retorno de datos de plantilla `409 idempotency_key_reused_with_different_request`. Mantener la llave en 255 caracteres o
menos.

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Idempotency-Key: template-order-ready-en-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "order_ready",
    "language": "en_US",
    "category": "UTILITY",
    "parameter_format": "NAMED",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{customer_name}}, your order is ready.",
        "example": {
          "body_text_named_params": [
            {
              "param_name": "customer_name",
              "example": "Example User"
            }
          ]
        }
      }
    ]
  }'
```

Respuesta:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "template_id": "987654321098765",
  "status": "PENDING",
  "parameter_format": "NAMED"
}
```

### Upload Planlate Header Media

```http
POST /v1/templates/media
```

Requisitos `templates:write`. Easyhook sube el archivo a través de la API de carga resumible de Meta y devuelve el
`handle` requeridos en `components[].example.header_handle` al crear una imagen, un vídeo o un documento
plantilla.

Identificar el WABA con `from`, `phone_id`, `waba_id`. Suministro exactamente una fuente:

- `file_base64` junto con `file_name` y `file_type`.
- `source_url`, que contiene una URL HTTPS pública. Easyhook descarga y valida el archivo antes de subirlo
  a Meta. URLs de redes privadas, credenciales en URLs, URLs no HTTPS y redirecciones a esos destinos son
  rechazado.

Uso `source_url` Base64 aumenta el tamaño de la solicitud y está destinado a una aprobación más pequeña
Activos.

Para conservar el ejemplo de aprobación como el activo de envío predeterminado, también proporcionar `template_name`,
`template_language`, y `media_type` (`image`, `video`, `document`).

```bash
FILE_BASE64="$(base64 -w 0 ./promotion.jpg)"

curl -X POST https://api.easyhook.dev/v1/templates/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"template_name\": \"monthly_offer\",
    \"template_language\": \"es_MX\",
    \"media_type\": \"image\",
    \"file_name\": \"promotion.jpg\",
    \"file_type\": \"image/jpeg\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

La misma operación utilizando una URL:

```json
{
  "from": "15550100002",
  "source_url": "https://cdn.example.com/monthly-offer.mp4",
  "template_name": "monthly_offer_video",
  "template_language": "es_MX",
  "media_type": "video"
}
```

Utilice el mango devuelto en los componentes de la creación:

```json
{
  "type": "HEADER",
  "format": "IMAGE",
  "example": {
    "header_handle": ["4::meta-upload-handle"]
  }
}
```

Subir de nuevo para el mismo WABA, el nombre de plantilla y el lenguaje reemplaza el activo predeterminado de Easyhook
elimina el objeto de almacenamiento privado anterior.

## Borrar la plantilla

Punto final:

```http
POST /v1/templates/delete
```

Requisitos `templates:write`. Elimina una plantilla en Meta y elimina el registro local de Easyhook.

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from`, `phone_id`, `waba_id` | cuerda | Resolución de WABA. Preferencia `from` para las integraciones de clientes. |
| `template_id` | cuerda | Easyhook local plantilla fila id. |

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/delete \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","template_id":"template_uuid"}'
```

## Enviar mensaje de plantilla

Punto final:

```http
POST /v1/messages/template
```

Campos obligatorios:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `from` | cuerda | Número de teléfono de negocios WhatsApp propiedad del arrendatario. |
| `to` | cuerda | Recipiente número de WhatsApp. |
| `template` o `template_id` | objeto/estring | Referencia de plantilla pública o plantilla interna heredada hilera id. |

Campos opcionales:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `parameters` | objeto | Formato variable amigable. Conversos Easyhook a Meta `components`. |
| `components` | array | Componentes de plantilla de Meta cruda. `parameters` cuando se envía. |
| `media` | objeto | Medios de encabezado dinámicos. `link`, `id`, o medios reutilizables `name`; los documentos pueden incluir `filename`. |
| `at` | cuerda | Fecha/hora ISO 8601 para la entrega programada. |
| `phone_id` | cuerda | Legacy Easyhook teléfono fila id. Preferencias `from`. |

Referencia de plantilla recomendada por nombre e idioma:

```json
{
  "template": {
    "name": "pedido_listo",
    "language": "es_MX"
  }
}
```

La referencia de la plantilla sólo se acepta sólo cuando el nombre de la plantilla se resuelve a exactamente una plantilla en el WABA detrás `from`:

```json
{
  "template": {
    "name": "welcome_template_test"
  }
}
```

Meta plantilla de referencia id también se acepta:

```json
{
  "template": {
    "meta_template_id": "1234567890"
  }
}
```

Variables de plantilla:

Uso `parameters.body` y `parameters.header` para variables de texto. Easyhook convierte estos componentes en Meta plantilla.

Forma de array para variables posicionales:

```json
{
  "parameters": {
    "body": ["Example User", "12345"]
  }
}
```

Forma de objetos para variables nombradas o numeradas:

```json
{
  "parameters": {
    "body": {
      "1": "Example User",
      "order_id": "12345"
    }
  }
}
```

Manual Meta `components` se puede enviar directamente para casos avanzados:

```json
{
  "components": [
    {
      "type": "body",
      "parameters": [{ "type": "text", "text": "Example User" }]
    }
  ]
}
```

### Medios de encabezado predeterminados y dinámicos

Para las plantillas de imagen, vídeo y encabezado de documentos, Easyhook utiliza esta precedencia:

1. Una cabecera mediática suministrada `components`.
2. El amistoso `media` objeto.
3. El activo de aprobación almacenado por Easyhook.

Los medios de comunicación presentados para su aprobación son un defecto reutilizable, no una restricción.
en cada envío.

URL dinámica:

```json
{
  "from": "15550100002",
  "to": "13125550199",
  "template": { "name": "monthly_offer", "language": "es_MX" },
  "media": { "link": "https://cdn.example.com/customer-specific-offer.jpg" },
  "parameters": { "body": ["Example User"] }
}
```

Anteriormente subido Meta media:

```json
{ "media": { "id": "123456789012345" } }
```

Reutilizable medios Easyhook:

```json
{ "media": { "name": "july_catalog", "filename": "catalog-july.pdf" } }
```

Componente de documento Raw Meta:

```json
{
  "components": [
    {
      "type": "header",
      "parameters": [
        {
          "type": "document",
          "document": {
            "link": "https://cdn.example.com/invoice.pdf",
            "filename": "invoice-123.pdf"
          }
        }
      ]
    }
  ]
}
```

El tipo de medios dinámicos debe coincidir con el formato de encabezado aprobado. Easyhook rechaza referencias ambiguas,
enlaces no-HTTPS, medios de comunicación sobre plantillas sin un encabezado multimedia, y desajustes de imagen/video/documento.

Las plantillas programadas conservan la referencia de los medios seleccionados. Los medios reutilizables se resuelven y firman cuando el
Trabajo programado ejecuta, evitando URLs expiradas.

Después de editar una plantilla en Meta, llame `POST /v1/templates/sync`. Easyhook aumenta el ID actual del proveedor,
status, components, category, and quality for the same WABA/name/language. No enviar la definición editada
hasta que el estado sincronizado regrese a `APPROVED`.

Ejemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","template":{"name":"pedido_listo","language":"es_MX"},"parameters":{"body":["Example User"]}}'
```

Respuesta al éxito:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Chat de Easyhook en vivo

Chat en vivo es un canal de propiedad de Easyhook para aplicaciones del navegador.
utilizarlo sin operar un backend separado y sin exponer un normal
Easyhook API key. Crear y configurar el widget en el portal, luego copiar el
clave publicable (publicable clave)`eh_chat_pk_...`) en el sitio web.

La clave publicable sólo identifica un widget. No otorga acceso a la
organización, Inbox, Supabase, otros contactos, u otras conversaciones.
un modelo de origen exacto y render Cloudflare Turnstile antes de arrancar un
sesión de visitas.

Crear una sesión:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key":"eh_chat_pk_xxx",
    "display_name":"Ada",
    "email":"ada@example.com",
    "turnstile_token":"TURNSTILE_RESPONSE"
  }'
```

Los clientes anónimos no pueden elegir `visitor_id`; Easyhook genera un fresco
`ehusr_...` identidad para que un navegador no pueda reclamar la historia de otro visitante.
la respuesta también incluye `conversation_id` (`ehconv_...`), un acceso de 15 minutos
token y un token de refresco rotativo. Almacene las fichas sólo para este navegador.

Para un usuario de aplicación firmado, el backend del cliente crea primero un
token de identidad de cinco minutos con la clave de Easyhook API:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/identity-tokens \
  -H 'Authorization: Bearer eh_live_xxx' -H 'Content-Type: application/json' \
  -d '{"widget_id":"WIDGET_UUID","external_user_id":"usr_42","roles":["buyer"]}'
```

Pase el regreso `identity_token` al inicio de sesión. Los roles son opacos
metadatos de clientes; Easyhook impone la identidad firmada, la conversación
membresía y acción de chat permitido, mientras que el cliente sigue siendo responsable de
sus propias reglas de autorización comercial.

Enviar un mensaje de texto con un identificador de idempotencia generado por el cliente:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/messages \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"body":"Necesito ayuda","client_message_id":"web_01JABCDEF"}'
```

Use el mismo punto final con `type` igual a `image`, `video`, `audio`,
`document`, `sticker` y proporcionar `file_name`, `file_type`, y
`file_base64`. `reply_to` cita otro mensaje y `forwarded_from` preserves
el identificador de mensaje original cuando la aplicación avanza contenido.

Edita, elimina, reacciona, lee y escribe una acción idempotente:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/actions \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"action":"reaction","message_id":"lc_xxx","emoji":"❤️","client_action_id":"action_01JABCDEF"}'
```

Lea nuevos mensajes:

```bash
curl 'https://api.easyhook.dev/v1/live-chat/sessions/current/messages?after=2026-08-18T20:00:00.000Z&limit=50' \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx'
```

Girar la sesión antes de que el token de acceso expire:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/refresh \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"eh_chat_refresh_xxx"}'
```

Las fichas de referencia son de uso único. Un refrescante exitoso invalida ambos anteriores
Tokens y devuelve un nuevo par.

Para conversaciones y grupos directos de propiedad de la aplicación, un backend confiable utiliza
`POST /v1/live-chat/app/conversations` con `widget_id`, `from`, `kind`,
`members`, y (para grupos) `title`. Lista de clientes escotados
`/sessions/current/conversations`, luego leer/enviar bajo
`/sessions/current/conversations/{ehconv_id}/messages` y utilizar el hermano
`actions` y `state` endpoints. El servidor siempre infiere `from` del ámbito de aplicación
sesión; los clientes envían a un `ehconv_...` conversación y no puede forjar otra
remitente.

El servidor valida la sesión y su origen original en cada solicitud.
Las operaciones de bootstrap y de período de sesiones tienen límites sostenidos independientes; límite de tarifas
respuestas HTTP `429` con `Retry-After`. Retorno de los períodos de sesiones inválidos/expiridos
`401`, un origen desajustado regresa `403`, y la verificación Turnstile indisponible
texto/media duradero, pegatinas, respuestas, metadatos de reenvío,
reacciones, ediciones, lápidas de eliminación y cursores de lectura por miembro están habilitados.
La escritura es una señal de extinción expuesta a través de `state`; los agentes organizacións también reciben
a través del tema de Inbox Broadcast privado.

El instalado `easyhook-chat.js` widget renders text and protected media,
pegatinas, respuestas, reacciones, ediciones, lápidas de eliminación, leer estado y escribir.
Utiliza los puntos finales de sesión abarcados solamente; nunca incrusta una organización API
clave o supabase credential.

Los mensajes de visitantes entrantes usan la normalidad `message.text` webhook sobre con
`channel: "live_chat"`, y aparecen en la bandeja de entrada multicanal. Chat en vivo envía
y acciones duraderas utilizan el libro mayor de operaciones de la cartera con idempotencia cliente
claves. La encuesta de lectura/lista no se factura, evitando los cargos duplicados
refrescar o reconectar el comportamiento.

## Regla de documentación

Al cambiar el comportamiento de la API pública, actualice este documento antes de fusionar/desplegar el cambio. Al mínimo, actualice:

- Camino y método Endpoint.
- Autenticación/scopios si cambian.
- Campos obligatorios y opcionales.
- Comportamiento de error.
- Solicitud de ejemplo.
- Cumplimiento importante o restricciones metapolíticas.
