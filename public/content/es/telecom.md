# Easyhook Telecom API

Easyhook ofrece un contrato estable para números, SMS, MMS y llamadas sin exponer objetos propios del proveedor. La disponibilidad depende de las capacidades del número, el país y los requisitos regulatorios aplicables.

## Diseño

Easyhook expone recursos estables (`numbers`, `messages`, `calls`) en lugar de objetos nativos de proveedor. Un número registra un vector de capacidad, por lo que los clientes pueden preguntar lo que soporta en lugar de ramificar en Telnyx, Infobip, DIDLogic, WhatsApp Calling o un futuro proveedor.

Las credenciales del proveedor son secretos de plataforma. La autorización del arrendatario siempre viene de la clave de Easyhook API y cada número de búsqueda/llamada está en alcance de su organización.

## Scopes

- `telephony:read`: disponibilidad de números, números conectados y estado de llamada.
- `telephony:write`: SMS/MMS y comandos de llamada.
- Existencia `messages:read` / `messages:write` las claves siguen siendo aceptadas durante el período de migración.

Las nuevas claves de API predeterminadas incluyen ambos alcances de telefonía.

## Puntos finales

### Capacidades

`GET /v1/telecom/capabilities`

Los proveedores de devoluciones configurados en el despliegue y las versiones de contrato estables.

### Números conectados

`GET /v1/telecom/numbers`

### Inventario de proveedores de búsqueda

`GET /v1/telecom/numbers/available?country_code=MX&area_code=81&capabilities=sms.outbound&capabilities=voice.outbound`

La búsqueda no compra un número. Los requisitos de inventario y regulación pueden cambiar entre la búsqueda y el orden.

Resultados expuestos `activation_price`, `initial_period_price`, `monthly_price`, `due_today`, `initial_period`, `next_renewal_at`, y la atención al cliente `usage_estimates` en la moneda de la billetera. `activation_price` es un cargo de activación de una sola vez. `initial_period_price` prorratea el precio de Easyhook recurrente por días calendario UTC inclusivos desde la fecha de compra hasta finales de ese mes. `due_today` es la activación más el período inicial; `monthly_price` es la cantidad total cobrada por adelantado en el primer día de los meses posteriores. Las cargas de pago nativas del proveedor, los costos subyacentes y las reglas comerciales internas no se devuelven deliberadamente. El inventario se omite cuando Easyhook no puede ofrecer y verificar un precio competitivo.

### Compra un número

`POST /v1/telecom/numbers/orders`

```json
{
  "phone_number": "+15551234567",
  "country_code": "US",
  "messaging_profile_id": "<optional-easyhook-profile-uuid>",
  "expected_currency": "USD",
  "expected_activation_amount_millicents": 100000,
  "expected_initial_period_amount_millicents": 23371,
  "expected_monthly_amount_millicents": 103500,
  "expected_due_today_amount_millicents": 123371
}
```

`Idempotency-Key` Easyhook vuelve a buscar el número exacto, rechaza los precios fijos, incluyendo una cita que cruzó un límite del mes UTC, verifica la disponibilidad regulatoria, se reserva el total `due_today` cantidad en la billetera y sólo entonces pedidos del proveedor. Una cotización cambia devuelve `409 telecom_price_changed` con los valores de activación actual, de período inicial, mensual, de día a día, de duración limitada y de renovación. Los números que requieren un flujo de trabajo regulatorio permanecen indisponibles hasta que se implemente ese flujo de trabajo.

Los perfiles de mensajería son recursos de Easyhook abarcados a una organización y un programa de consentimiento. Los números de SMS/MMS-capable requieren un perfil activo que apoye al país de destino; cuando `messaging_profile_id` Se omite, Easyhook utiliza el perfil por defecto único de esa organización y las disposiciones que automáticamente se encuentra en la primera compra de números compatibles cuando no existe ninguno. Los IDs de perfil de operador, la configuración de estado de exclusión y palabras clave nunca son globales o aceptados por las solicitudes de los clientes.

Un número compatible con SMS/MMS también crea un Easyhook activo `sms` canal y número de teléfono alias en la misma organización. Los mensajes entrantes se persisten en la bandeja de entrada compartida bajo ese canal; las llamadas de voz usan el mismo número de telecomunicaciones y la identidad de contacto mientras conservan su ciclo de vida de llamada separado. Un perfil de mensaje es reutilizable por los números de la organización que comparten el mismo programa de consentimiento - no se crea una vez por número.

### SMS o MMS

Punto final canónico: `POST /v1/messages/text`.

```json
{
  "channel": "sms",
  "from": "+15551234567",
  "to": "+528441234567",
  "body": "Hola desde Easyhook"
}
```

`channel` se puede omitir cuando el número identifica solamente Telefonía. Incluirlo
cuando ese mismo número también está conectado a WhatsApp. El legado
`POST /v1/messages/sms` la ruta permanece temporalmente disponible y devuelve una
deprecation header. MMS utiliza el canonical `/v1/messages/media` contrato una vez
la tarifa de destino y la capacidad de número están habilitados.

Ambos números deben ser E.164. `from` debe ser un número activo propiedad de la organización autenticada con la capacidad necesaria. Uso `Idempotency-Key` por cada comando.

Para SMS o MMS, Easyhook coloca una cartera conservadora y reembolsable antes
contactar con el portaaviones. `202` la respuesta expone que se mantiene como
`maximum_reserved_cost`; no es la carga final. Cuando la firma
`message.finalized` evento llega, Easyhook resuelve la tarifa actual del cliente
contra la cantidad facturable confirmada y devuelve la retención no utilizada. Esto permite
destino y precios dependientes del transportista sin adivinar una tasa de transporte
antes de la entrega. Los mensajes entrantes no reciben más tarde `message.finalized`
evento. Easyhook crea una sujeción determinista de la firma
`message.received` callback y lo liquida inmediatamente desde el coste del transportista en
ese mismo callback, devolviendo cualquier saldo no utilizado.

### Inicie una llamada

`POST /v1/calls`

```json
{
  "channel": "phone",
  "from": "+15551234567",
  "to": "+528441234567",
  "endpoint_id": "<registered-call-endpoint-uuid>",
  "max_duration_seconds": 1800
}
```

Para las campañas de IA de salida, seleccione un agente de ElevenLabs para el papel de salida.
Puede ser el mismo agente utilizado para llamadas entrantes o una diferente.
agente es útil cuando el mensaje de apertura, el impulso o las herramientas difieren, pero Easyhook
no requiere esa separación.
Easyhook origina la pierna PSTN, espera hasta que la persona responda, y luego
puentes sobre SIP al agente de salida configurado; el audio no es proxiado
a través de Easyhook. El agente recibe el per-call opcional `context` como tal
sanitized `X-Easyhook-*` Cabeceras SIP ( cuerdas escalar, números y booleanos
sólo; no credenciales o contenido de mensajes). Prompts, voces y herramientas permanecen
manejado en ElevenLabs.

```json
{
  "channel": "phone",
  "handler": "ai",
  "from": "+15551234567",
  "to": "+528441234567",
  "max_duration_seconds": 900,
  "context": { "customer_id": "crm-1842", "language": "es" }
}
```

Las llamadas iniciadas por IA requieren una voz explícita previa opt-in para el exacto
organización, número de Easyhook y destino. Grabar con
`POST /v1/consent` utilizando `channel: "voice"`, `status: "opt_in"`, a non-empty
`evidence` objeto y `captured_at`; registro `opt_out` inmediatamente cuando el
El contacto retira el permiso. Easyhook impone un intento de IA por hora y
tres por rodaje 24 horas por número/contacto, además de idempotencia.
La API devuelve `voice_ai_consent_required`, `voice_ai_contact_opted_out`,
`voice_ai_outreach_too_soon` o `voice_ai_outreach_daily_limit` cuando una llamada es
bloqueado. Estas reglas de voz complementan (y no reemplazan) mensajería Telnyx
Manejo de STOP/START.

`POST /v1/calls` nunca acepta un ID arbitrario de un agente de ElevenLabs.
`handler: "ai"`, Easyhook utiliza sólo el agente saliente que una organización
propietario o administrador asociado con ese número exacto de Easyhook. Si está ausente,
el API devuelve `409 voice_ai_outbound_agent_not_configured`; nunca cae
de vuelta al agente entrante.

`handler` predeterminados a `human`. Es válido sólo para `channel: "phone"` cuando
establecido `ai`; WhatsApp Calling no utiliza el puente SIP de ElevenLabs.
La respuesta de una llamada con IA es `202`, con el recurso normal de llamada y
sin token WebRTC. La llamada se puede consultar y finalizar mediante los endpoints
estándar. El wallet sólo empieza a cobrar cuando la llamada conecta y liquida el
costo final de voz de Telnyx más el margen de Easyhook prorrateado por los segundos
conectados. El cliente consume por separado los minutos incluidos en ElevenLabs.

Uso `channel: "phone"` para PSTN y `channel: "whatsapp"` para WhatsApp
Llamando cuando el mismo `from` puede resolver a ambos, es opcional de otra manera.

`max_duration_seconds` (se requiere)`30`–`14400`). Determina la reserva máxima de billetera. Easyhook inicia un plazo de servidor autenticado cuando el proveedor informa de la llamada contestada; el plazo termina la pierna del proveedor y resuelve la reserva incluso si el navegador, el teléfono o el proceso del cliente permanece conectado o está manipulado. Si un cliente obtiene credenciales WebRTC pero ninguna llamada del proveedor comienza dentro de dos minutos, Easyhook cancela la llamada pendiente y devuelve la reserva completa.

Telnyx `webrtc.dial.client_state` es una autorización firmada, de dos minutos, de una sola llamada vinculada a la organización exacta, llamada, endpoint, caller, destino y duración máxima. La conexión Credencial estaciona la pierna WebRTC; Easyhook valida la autorización y crea una pierna PSTN idempotente a través de la aplicación Control de Llamadas usando Telnyx `link_to` y `bridge_on_answer`, por lo que ambas piernas están conectadas atópicamente cuando el destino responde. La pierna PSTN conserva la misma autorización firmada y se almacena como par de la pierna canónica WebRTC. Easyhook rechaza e inmediatamente termina una pierna de proveedor outbound cuando esa autorización está faltando, expirado, alterado, reinterpretado después de que otra pierna gana, o no coincide con el Webhook de Telnyx.

Para WhatsApp Calling, utilice un arrendatario `phone_id` (o su remitente configurado en `from`) y enviar la oferta WebRTC:

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "from": "15551234567",
  "to": "528441234567",
  "max_duration_seconds": 1800,
  "session": { "sdp_type": "offer", "sdp": "v=0..." }
}
```

Las llamadas WhatsApp iniciadas por negocios requieren permiso del usuario. Meta devuelve su error de llamada documentado cuando el permiso está ausente. Los medios nunca atraviesan Easyhook: el cliente negocia WebRTC con Meta o Telnyx mientras Easyhook maneja autorización, enrutamiento, estado, billetera y webhooks normalizados. Para Telnyx, la respuesta contiene `webrtc.token` y `webrtc.dial`; llamada `TelnyxRTC.newCall` para salida WhatsApp, encuesta `GET /v1/calls/{call_id}/signaling` hasta `session.ready` e instalar la respuesta SDP devuelta como la descripción remota de la conexión entre pares.

Solicitar permiso para llamar a WhatsApp iniciado por el negocio antes de marcar:

Compruebe el permiso actual y las acciones actualmente permitidas de Meta primero:

`GET /v1/whatsapp/calling/permissions?from=15551234567&to=528441234567`

La respuesta preserva la de Meta `permission_status` y límites de acción. `start_call` se permite; enviar una solicitud de permiso sólo cuando `send_call_permission_request` está permitido.

`POST /v1/whatsapp/calling/permissions`

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "to": "528441234567",
  "body": "¿Podemos llamarte para ayudarte con tu solicitud?"
}
```

Meta controla la elegibilidad, el vencimiento y los límites de tarifas. Easyhook normaliza la respuesta de permiso como una interacción/webhook inbound; nunca se infiere del texto ordinario.

### Registrar un punto final de respuesta

`POST /v1/call-endpoints`

```json
{
  "endpoint_key": "installation-or-worker-id",
  "kind": "android",
  "user_id": "<organization-member-user-id>",
  "status": "available",
  "metadata": { "mobile_device_id": "<mobile_devices.id>" }
}
```

Use exactamente uno de los `user_id` o `external_agent_id`. Web, Android y iOS endpoints reciben un Telnyx WebRTC de corta duración JWT y un ID de punto final estable. `POST /v1/call-endpoints/{endpoint_id}/token`; Easyhook nunca devuelve una contraseña de SIP del cliente. `endpoint_key`; un punto final es itinerable sólo mientras `available` y visto en los últimos 90 segundos.

Uso de puntos finales externos `external_agent_id`A `sip` endpoint debe proporcionar un validado `provider_address` tales como `sip:agent@example.com`; una llamada de Telnyx se ofrece a `api` endpoint sólo cuando también tiene una dirección SIP proveedor, porque un Webhook solo no puede llevar audio. `api` endpoint without a SIP address: claim returns the short-lived SDP offer and the integration answers through `pre-accept` y `accept`. Los endpoints SIP no son seleccionados para WhatsApp porque Meta utiliza su contrato de llamada WebRTC/SDP en lugar de una pierna SIP cliente.

El mismo contrato potencia a los propios clientes de Easyhook y a los productos del cliente:

| Cliente cliente | PSTN media | WhatsApp Calling media | Incoming notification |
| --- | --- | --- | --- |
| Portal de navegador | `kind: "web"` y el devuelto Telnyx WebRTC JWT | Navegador WebRTC con Meta SDP | Signed `call.offered` webhook |
| Aplicación móvil nativa | `kind: "android"` o `"ios"` y el devuelto Telnyx WebRTC JWT | WebRTC nativo con SDP de Meta | Signed `call.offered` webhook; la entrega del cliente es su responsabilidad |
| Backend/voice worker | `kind: "sip"`, `kind: "api"` con un SIP válido `provider_address` | `kind: "api"` con WebRTC/SDP | Signed `call.offered` webhook |

Registrar, mantener activo o consultar un endpoint no inicia un cobro. `POST /v1/calls`
y la acción para finalizar una llamada tampoco añaden cargos separados
por operación, ya se invoquen desde un portal, aplicación móvil o servidor. Las
llamadas conectadas se facturan mediante `call.per.minute`; el reporte conserva
los segundos conectados exactos. Easyhook reserva y liquida el costo PSTN. Meta
factura WhatsApp Calling directamente al WABA del cliente y Easyhook sólo cobra
su tarifa de plataforma. Las llamadas rechazadas o sin respuesta se liquidan en cero.

Una solicitud de autorización de llamada de WhatsApp coloca una cartera reembolsable y se asienta
su cuota de operación sólo después de que Meta acepte la solicitud.
libera la suspensión completa.

### Contrato de respuesta

- `POST /v1/calls/{call_id}/actions/claim` atomically wins a call for `endpoint_id`.
- Para inbound WhatsApp, reclamar devuelve la oferta SDP de Meta. Generar una respuesta, llamar `pre-accept`, establecer WebRTC, luego llamar `accept` con la misma respuesta SDP; esto evita el audio recortado al principio y sigue el contrato de sesión de Meta.
- `POST /v1/calls/{call_id}/actions/pre-accept` con `endpoint_id` y `sdp`.
- `POST /v1/calls/{call_id}/actions/accept` con `endpoint_id` y `sdp`.
- `POST /v1/calls/{call_id}/actions/decline` ofrece la llamada al siguiente punto final elegible.
- `POST /v1/calls/{call_id}/actions/hangup` termina Telnyx o WhatsApp a través del proveedor correcto.

El enrutamiento del equipo predeterminado es deliberadamente silencioso: el agente disponible asignado primero, luego el agente menos respaldado; los propietarios/admins son retrocesos. Exactamente un punto final anillos durante 20 segundos. Cloud Tasks expira el contrato de arrendamiento y ofrece el siguiente punto final compatible. API/SIP endpoints participan en el mismo orden, por lo que las aplicaciones del cliente pueden responder sin utilizar el Easyhook inbox, pero Easyhook nunca ofrece un proveedor para llevar el endpoint

Lea o actualice la política de un número con `GET /v1/call-routing` y
`PATCH /v1/call-routing`. Uso `?phone_id={id}` para un número Telnyx comprado,
o `?phone_id={id}&channel=whatsapp` para un teléfono WhatsApp.
sin embargo `phone_id` sigue siendo sólo como un retroceso de compatibilidad para los números que sí
el portal siempre configura un número de hormigón.
controla las llamadas corrientes de entrada, retroceso cuando un agente de IA
no responde, y una entrega humana solicitada por AI. `destinations` es una orden
lista conteniendo en la mayoría de una `web` destino, en la mayoría de un `mobile` destino,
y cualquier lista de propiedad de los arrendatarios `external_phone` destinos en formato E.164.
WhatsApp invalida `external_phone` destinos. Sólo un destino
endpoint se ofrece a la vez; la piscina de teléfono externo selecciona a la mayoría de una
número antes de volver a la web/móvil en el próximo intento.
en el mismo uso prioritario `external_phone_strategy: "round_robin"` o `"random"`.

Estrategias `assigned_then_round_robin` (default), `round_robin`, y
`api_only`; los límites configurables son de 8 a 30 segundos por intento y 1–20 intentos.
`api_only` portal deshabilitado deliberadamente, retroceso de teléfono móvil y externo.
Múltiples dispositivos pertenecientes a un agente siguen siendo puntos finales separados, pero sólo los
select endpoint recibe la oferta privada. Una oferta rechazada o caducada
Avances al siguiente punto final elegible en lugar de sonar cada dispositivo.

```json
{
  "strategy": "assigned_then_round_robin",
  "ring_timeout_seconds": 20,
  "max_attempts": 6,
  "owner_admin_fallback": true,
  "external_phone_strategy": "round_robin",
  "destinations": [
    { "kind": "web", "label": "Portal", "priority": 10 },
    { "kind": "mobile", "label": "App móvil", "priority": 20 },
    { "kind": "external_phone", "label": "Guardia", "phone_number": "+528441234567", "priority": 30 }
  ]
}
```

Una pierna PSTN externa se crea sólo cuando su vuelta llega. Easyhook primero
reserva la billetera organización por su duración máxima, firma el destino exacto
en la pierna del transportista, establece el uso real del proveedor desde el costo de llamada verificado
eventos, y devuelve la reserva no usada. Un precio o falla de la cartera nunca
cae de nuevo a un número o balance de otra organización.

Portal y móvil utilizan el mismo tiempo de ejecución a través de servidores autorizados `/admin/calls/*` rutas. El portal Vercel expone sólo un permitido bajo `/api/calls/*`, preserva la firma de organización/actor autenticado y nunca envía una clave de API de cliente al navegador o teléfono. Las llamadas iniciadas desde una bandeja de entrada utilizan la misma política de préstamo del proveedor: los costos de transportista facturados a Easyhook utilizan una reserva de billetera, mientras que WhatsApp Calling es facturado por Meta directamente a la WABA del cliente y por lo tanto no crea ninguna reserva de costo del proveedor Easyhook.

### ElevenLabs agentes de voz (intección portuaria)

Las organizaciones pueden conectar su propia clave de API de ElevenLabs desde el portal bajo
Integración. Easyhook valida la llave, la almacena encriptada en el arrendatario
bóveda secreta y expone sólo el estado de conexión y el agente de la organización
nombres. La clave nunca se devuelve a un navegador, aplicación móvil o webhook cliente.

El portal asigna un agente de inteligencia artificial de once laboratorios y,
opcionalmente, un agente saliente a un número activo de Easyhook Telnyx. Ambos roles
puede utilizar el mismo agente; Easyhook no selecciona uno implícitamente para el outbound
llamadas.
Easyhook importa el número público para el enrutamiento inbound y utiliza un privado,
identificador SIP no-dialable para routing outbound. Telnyx envía audio directamente
a ElevenLabs; Easyhook no proxy o transcribe el audio. Cada número tiene
su propia unión:

- `ai_only`: OnceLabs respuestas; no se ofrece un punto final humano.
- `ai_then_agents`: OnceLabs recibe el primer intento, luego humano normal
  el enrutamiento se utiliza si el intento de la IA no está disponible o expira.

`human_transfer_enabled` es independiente de esos modos de respuesta inicial.
habilitado, Easyhook instala un gestionado `transfer_to_number` herramienta del sistema en
El agente elegido de ElevenLabs. Una transferencia solicitada durante una AI activa
la conversación utiliza SIP REFER a un objetivo Easyhook opaque HMAC. Easyhook
verifica la sesión vinculante, organización, número y llamada activa, luego utiliza
la misma política de destino por número descrita anteriormente.
recibe la lista de teléfonos externos reales. Otras herramientas de agente y transferencia de clientes
las reglas se conservan. `api_only` routing deliberadamente deshabilita el humano manejado
desvío.

Las rutas Portal-admin son:

- `GET /admin/integrations/elevenlabs`
- `POST /admin/integrations/elevenlabs` con `{ "tenant_id", "api_key" }`
- `GET /admin/integrations/elevenlabs/agents`
- `GET /admin/telecom/voice-ai`
- `PUT /admin/telecom/numbers/{number_id}/voice-ai` con entrada `agent_id`,
  opcional `outbound_agent_id` (que puede ser igual `agent_id`), `mode`,
  opcional `answer_timeout_seconds` (`8`–`30`) y
  `human_transfer_enabled`
- `DELETE /admin/telecom/numbers/{number_id}/voice-ai`

El impulso del sistema del agente, la voz, la base de conocimientos y las herramientas siguen siendo gestionadas
ElevenLabs. Las herramientas Webhook o n8n pueden proporcionar lógica de negocio al cliente sin
colocar n8n en el bucle de audio en tiempo real.

Esta unión actualmente se aplica sólo a los números de Easyhook Telnyx.
también soporta los agentes de voz de WhatsApp, y documenta un patrón SIP solo de voz
que puede mantener el mensaje con otro proveedor. Ese patrón no es equivalente
a la unión actual Easyhook: cuando la señalización SIP está habilitada en un WhatsApp
número, Meta detiene el envío de comandos Calling Graph API y llamada webhooks para
que número. Habilitarlo directamente evitaría la normalización de Easyhook
`call.offered` Lifecycle, API endpoints, Inbox/mobile routing, billetera
hasta que Easyhook opere un filo de SIP organización
que preserva esos controles, `handler: "ai"` con `channel: "whatsapp"`
Devoluciones `voice_ai_phone_channel_required`; no reconfigurar silenciosamente un
número de cliente a SIP.

### Lea o cuelgue una llamada

- `GET /v1/calls/{call_id}`
- `GET /v1/calls/{call_id}/signaling`
- `POST /v1/calls/{call_id}/actions/hangup`

## Webhooks

Suscríbete con el proveedor `sms`, `voice` o `whatsapp`:

- `message.received`
- `message.status`
- `call.initiated`
- `call.answered`
- `call.hangup`
- `call.connect`
- `call.ringing`
- `call.accepted`
- `call.transfer_started`
- `call.terminate`
- `number.renewal_due`
- `number.renewed`
- `number.grace`
- `number.released`

Los webhooks del proveedor se verifican con Ed25519 sobre el cuerpo crudo exacto, los tiempos de rechazo más de cinco minutos y se deduplican antes del procesamiento. Easyhook emite su webhook del cliente firmado normal.

## Contrato de facturación

La facturación de Telecom tiene tres componentes visibles por separado:

1. alquiler de números recurrentes, cobrado por adelantado;
2. uso final del proveedor (segmentos, medios o costo de voz);
3. Nivel de servicio Easyhook.

Las reglas de cara al cliente son:

- la activación se carga una vez;
- el período de número inicial se prorratea por días calendario de UTC inclusivos que quedan en el mes de compra y se añade a `due_today`;
- alquiler más tarde se renueva por adelantado `00:00 UTC` el primer día de cada mes;
- inbound and outbound SMS/MMS are billable by segment or message as shown in the quote;
- el costo de voz varía por dirección y destino; el margen de Easyhook se prorratea por segundo conectado;
- Las citas MXN incluyen protección de tipo de cambio, por lo que la cantidad mostrada y confirmada es la cantidad del cliente;
- inventario no está disponible a menos que Easyhook pueda verificar y honrar un precio competitivo.

Los costos de transporte, las fuentes de comparación y la fórmula comercial interna de Easyhook no forman parte del contrato público. La confirmación de compra y la respuesta de la API sólo exponen las cantidades que el cliente puede cobrar.

Los aranceles son versionados, tienen timetamps de verificación y validez, y son sólo de servicio-role-only. Ninguna tasa de muestra codificada duramente permite a un país. La compra de números sólo se habilita cuando el despliegue tiene las credenciales de Telnyx, un precio de inventario exacto, datos FX frescos y un punto de referencia verificado.

Los parámetros de referencia de los competidores se almacenan por separado de los aranceles de los proveedores comercializables.
Twilio Precios API suministros públicos `base_price` valores; Easyhook deliberadamente
no es un punto de referencia respecto de la cuenta específica `current_price` descuentos para SMS,
el precio base más bajo de portadores/delincuentes en un país es el referente conservador.
Para voz, los puntos de referencia conservan el mayor detalle de destino-prefijo devuelto por
Twilio. Una sincronización de referencia exitosa nunca activa un país por
en sí mismo: una tasa actual del proveedor de Telnyx o precio exacto del inventario es
todavía es necesario.

La búsqueda de puntos de referencia de voz sigue el prefijo E.164 más largo a nivel mundial, no
la etiqueta de país del punto final de fijación de precios. Esto se requiere para NANP: Twilio
publica general `+1` precios bajo EE.UU. y puede publicar más
excepciones por separado. Los conflictos de referencia de igualdad de duración utilizan el precio más bajo por lo que
la comparación sigue siendo conservadora.

Las importaciones Telnyx Global Conversational CSV se permiten listar a países configurados,
hashed, audited and replaced atomically per country. Non-numeric destination
patrones son rechazados. Cuando la cubierta de tasa contiene los precios dependientes del origen,
importador almacena el coste máximo aplicable para cada prefijo de destino por lo que
call is never reserved using an optimistic transport rate.

Grandes cubiertas de tarifa se suben en pedazos atados y publicados sólo después de la
El recuento de filas declarado está completo. Un aviso de transportista con un tiempo efectivo futuro
debe ser importado con ese exacto `valid_from`; la versión anterior termina en la
el mismo instante y permanece autorizado hasta entonces. Las filas futuras nunca afectan a un
cotizar temprano, y una importación incompleta en estadio nunca se convierte en facturable.

USD/MXN utiliza la serie Banco de México SIE `SF43718` (FIX). Cada observación tiene una
vencimiento atado y el margen de protección de intercambio del 5% se aplica sólo al convertir el
USD importe en un cargo de billetera MXN. Si Banxico o Twilio no pueden ser
verificado antes de la expiración, Easyhook falla cerrado en lugar de reutilizar datos de establo.

Las rutas de sincronización interna no son los puntos finales de la API del cliente:

- `POST /internal/telecom/pricing/fx/sync`
- `POST /internal/telecom/pricing/benchmarks/sync`
- `POST /internal/telecom/messages/reconcile`

Aceptan únicamente la identidad OIDC configurada de Cloud Scheduler o la existente
token administrativa. Las carreras se auditan sin almacenar las credenciales de origen o
cargas de pago crudas de cliente/providente. El monitoreo de página o távily puede alertar a los usuarios
acerca de los cambios de precios públicos, pero no puede escribir tarifas facturables.

Refrigerios de producción Twilio diario a las 05:30 y Banxico diariamente a las 18:30 en
`America/Monterrey`. La voz Telnyx CSV sigue siendo una importación verificada manualmente
porque Telnyx no documenta una API de descarga de velocidad de grado contable;
su validez limitada hace que los precios no se cierren si no se importa una nueva cubierta.

Antes de una operación de transporte, Easyhook se reserva su coste estimado máximo.
inbound SMS/MMS la firma `message.received` callback crea el determinista
reserva y su costo de transporte incluido lo liquida inmediatamente, porque
Telnyx emite `message.finalized` sólo para mensajes de salida. Easyhook aplica
la regla comercial, liquida la cantidad exacta y devuelve reserva no utilizada
fondos. Los reembolsos del centro fraccional se acumulan en lugar de ser redondeados.
use proveedor costo/duration webhooks y un máximo reforzado por servidor. A pending
llamada de salida que nunca llega al proveedor libera su reserva después
dos minutos; el inicio de un proveedor tardío se termina y no puede revivir el cancelado
llamada. WhatsApp Calling reserva el máximo solicitado y, al terminar, prorratea
la tarifa de plataforma de Easyhook de USD 0.004 por minuto según los segundos
conectados. La cuota ordinaria de operación de Easyhook API sigue siendo una
entrada independiente de la cartera para operaciones sin costo; comenzar y colgar una llamada
no crear cargos adicionales de operación.

SMS/MMS de salida normalmente se asienta de la firma `message.finalized` Webhook.
Como defensa contra las retries de portadores agotados, el reconciliador interno
checks aged, provider-linked holds against Telnyx's Message Detail Record and
se resuelve sólo cuando el transportista ha publicado un costo de USD autorizado.
Los registros no disponibles o sin costo permanecen reservados para una carrera posterior; Easyhook nunca
devuelve una operación de portaaviones simplemente porque una búsqueda falló.
reconciliador cada cinco minutos con el mismo límite Cloud Scheduler OIDC.

El alquiler se cobra por adelantado en los meses calendario. Una activación de los cargos de compra más el resto prorrateado de su mes calendario UTC; las renovaciones posteriores se deben el primer día de cada mes. Los avisos de renovación se emiten 7, 3 y 1 día antes de la renovación. Si la renovación no puede ser pagada, el uso se pausa y el número entra en un período de gracia de siete días. `easyhook-telecom-renewals` diariamente a las 06:15 `America/Monterrey`; Cloud Scheduler firma una solicitud de OIDC `POST /internal/telecom/renewals/process` y el backend acepta sólo el correo electrónico y el público configurado de cuenta de servicio (o el token administrativo existente para operaciones controladas).

Inbound Telnyx llama a reservar un máximo conservador de 60 minutos antes de un
Los anillos de punto final firmados `call.cost` suministros para eventos `total_cost` y
`billed_duration_secs`; Easyhook aplica la regla comercial de voz a eso
cantidad autorizada y devuelve la retención no usada. La llamada no es enrutada cuando
la billetera no puede cubrir el máximo temporal.
Esto evita que Easyhook extienda silenciosamente el crédito del transportista a
una billetera vacía sin pretender que la bodega es el precio final.

## Adaptadores futuros

Infobip y DIDLogic pueden implementar la misma interfaz de adaptador. `easyhook` El proveedor de WebRTC puede reutilizar el recurso de llamada más tarde, pero permanece fuera de esta versión porque también requiere TURN, UX de llamada entrante nativa, controles de abuso y operaciones QoS.

## Configuración necesaria para el despliegue

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_CLIENT_STATE_SECRET` (al menos 32 caracteres aleatorios; signos de autorización de línea saliente y debe ser almacenado en Secret Manager)
- `TELNYX_CALL_CONTROL_CONNECTION_ID`
- `TELNYX_CREDENTIAL_CONNECTION_ID` (una conexión credencial, no control de llamadas)
- `TELNYX_HUMAN_TRANSFER_SIP_DOMAIN` (el subdominio SIP de Telnyx utilizado sólo para las entregas firmadas de ElevenLabs)
- `BANXICO_SIE_TOKEN` para series oficiales USD/MXN FIX `SF43718`
- `TWILIO_PRICING_API_KEY` y `TWILIO_PRICING_API_SECRET`, restringido a la API oficial de precios
- `TELECOM_PRICING_COUNTRIES` como un solicitante explícito de la ISO (inicialmente) `US,CA,MX`)
- Un solo servicio. `telecom_messaging_profiles` fila para cada programa de consentimiento organización; el ID de perfil de Telnyx se almacena allí, nunca como una variable global Cloud Run
- Cloud Tasks cola y URL de envío autenticado para alquileres de enrutamiento duraderos, limpieza de arranque abandonado y terminación de máxima resistencia
- `CLOUD_SCHEDULER_SERVICE_ACCOUNT_EMAIL` y `CLOUD_SCHEDULER_OIDC_AUDIENCE` para las renovaciones número
- Meta app suscrita a `calls`, `whatsapp_business_messaging`, llamando habilitado en cada número de API Cloud elegible y un método de pago válido para llamadas iniciadas por negocios
