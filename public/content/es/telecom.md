# Easyhook Telecom API

Easyhook ofrece un contrato estable para números, SMS, MMS y llamadas sin exponer objetos propios del proveedor. La disponibilidad depende de las capacidades del número, el país y los requisitos regulatorios aplicables.

## Diseño

Easyhook expone recursos estables (`numbers`, `messages`, `calls`) en lugar de objetos nativos de proveedor. Un número registra un vector de capacidad, por lo que los clientes pueden preguntar lo que soporta en lugar de ramificar en Telnyx, Infobip, DIDLogic, WhatsApp Calling o un futuro proveedor.

Las credenciales del proveedor son secretos de la plataforma. La autorización de la organización siempre procede de su clave API de Easyhook. Cada consulta de números o llamadas queda limitada a esa organización.

## Scopes

- `telephony:read`: disponibilidad de números, números conectados y estado de llamada.
- `telephony:write`: SMS/MMS y comandos de llamada.
- Las claves existentes con `messages:read` / `messages:write` siguen siendo válidas durante el período de migración.

Las nuevas claves de API predeterminadas incluyen ambos alcances de telefonía.

## Puntos finales

### Capacidades

`GET /v1/telecom/capabilities`

Devuelve los proveedores configurados en el despliegue y las versiones estables del contrato.

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

`Idempotency-Key` es obligatorio. Easyhook vuelve a consultar el número exacto, rechaza cotizaciones desactualizadas —incluidas las que cruzaron el cambio de mes UTC—, verifica los requisitos regulatorios y reserva el importe completo de `due_today` en la wallet antes de solicitar la compra al proveedor. Si cambia la cotización, devuelve `409 telecom_price_changed` con los importes actuales de activación, período inicial, mensualidad y total a pagar, junto con las fechas del período y la renovación. Los números que requieren un trámite regulatorio no están disponibles hasta que ese flujo esté implementado.

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

Para SMS o MMS, Easyhook reserva un importe conservador y reembolsable en la wallet
antes de contactar al operador. La respuesta `202` presenta esa reserva como
`maximum_reserved_cost`; no es el cobro final. Cuando llega el evento firmado
`message.finalized`, Easyhook aplica la tarifa del cliente al consumo confirmado
y devuelve el saldo reservado que no se utilizó. Así admite precios que dependen
del destino y del operador sin adivinar el costo antes de la entrega.
Los mensajes entrantes no reciben un evento posterior `message.finalized`.
Easyhook crea una reserva determinista a partir del callback firmado
`message.received` y la liquida inmediatamente con el costo del operador incluido
en ese mismo callback, devolviendo el saldo no utilizado.

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

Para llamadas salientes con IA, selecciona un agente de ElevenLabs para ese rol.
Puede ser el mismo agente de las llamadas entrantes u otro. Separarlos resulta
útil si cambian el saludo, las instrucciones o las herramientas, pero no es obligatorio.
Easyhook inicia el tramo PSTN, espera a que la persona conteste y lo conecta
mediante SIP con el agente saliente configurado. El audio no pasa por Easyhook.
El agente recibe el `context` opcional de cada llamada en cabeceras SIP
`X-Easyhook-*` saneadas: sólo cadenas, números y booleanos, sin credenciales
ni contenido de mensajes. Las instrucciones, voces y herramientas se administran
en ElevenLabs.

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

Las llamadas iniciadas por IA requieren consentimiento explícito previo para voz,
asociado a la organización, el número de Easyhook y el destino exactos. Regístralo con
`POST /v1/consent`, usando `channel: "voice"`, `status: "opt_in"`, un objeto
`evidence` no vacío y `captured_at`. Registra `opt_out` inmediatamente cuando el
contacto retire el permiso. Además de la idempotencia, Easyhook permite un intento
con IA por hora y tres en cualquier período de 24 horas por número y contacto.
La API devuelve `voice_ai_consent_required`, `voice_ai_contact_opted_out`,
`voice_ai_outreach_too_soon` o `voice_ai_outreach_daily_limit` cuando bloquea
una llamada. Estas reglas de voz complementan, sin sustituir, el manejo de
STOP/START de Telnyx para mensajería.

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

Las llamadas de WhatsApp iniciadas por la empresa requieren permiso del usuario. Meta devuelve su error documentado cuando falta ese permiso. El audio no atraviesa Easyhook: el cliente negocia WebRTC con Meta o Telnyx, mientras Easyhook gestiona autorización, enrutamiento, estado, wallet y webhooks normalizados. Para Telnyx, la respuesta contiene `webrtc.token` y `webrtc.dial`; utiliza esos valores normalizados en `TelnyxRTC.newCall`. Para llamadas salientes de WhatsApp, consulta `GET /v1/calls/{call_id}/signaling` hasta que `session.ready` sea verdadero y establece la respuesta SDP recibida como descripción remota de la conexión WebRTC.

Solicitar permiso para llamar a WhatsApp iniciado por el negocio antes de marcar:

Compruebe el permiso actual y las acciones actualmente permitidas de Meta primero:

`GET /v1/whatsapp/calling/permissions?from=15551234567&to=528441234567`

La respuesta conserva `permission_status` y los límites de acciones de Meta. Llama sólo cuando esté permitido `start_call`; solicita permiso sólo cuando esté permitido `send_call_permission_request`.

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

Usa exactamente uno de estos campos: `user_id` o `external_agent_id`. Los endpoints web, Android e iOS reciben un JWT temporal de Telnyx WebRTC y un identificador estable. Renueva el token mediante `POST /v1/call-endpoints/{endpoint_id}/token`; Easyhook nunca devuelve una contraseña SIP del cliente. Mantén activo el endpoint actualizando el mismo `endpoint_key`: sólo puede recibir llamadas mientras esté `available` y haya registrado actividad en los últimos 90 segundos.

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

Una solicitud de permiso para llamadas de WhatsApp reserva saldo reembolsable
en la wallet y liquida su cargo por operación sólo cuando Meta la acepta.
Si el proveedor rechaza la solicitud, se libera la reserva completa.

### Contrato de respuesta

- `POST /v1/calls/{call_id}/actions/claim` asigna atómicamente la llamada a `endpoint_id`.
- Para inbound WhatsApp, reclamar devuelve la oferta SDP de Meta. Generar una respuesta, llamar `pre-accept`, establecer WebRTC, luego llamar `accept` con la misma respuesta SDP; esto evita el audio recortado al principio y sigue el contrato de sesión de Meta.
- `POST /v1/calls/{call_id}/actions/pre-accept` con `endpoint_id` y `sdp`.
- `POST /v1/calls/{call_id}/actions/accept` con `endpoint_id` y `sdp`.
- `POST /v1/calls/{call_id}/actions/decline` ofrece la llamada al siguiente punto final elegible.
- `POST /v1/calls/{call_id}/actions/hangup` termina Telnyx o WhatsApp a través del proveedor correcto.

El enrutamiento predeterminado evita hacer sonar a todo el equipo: primero selecciona al agente asignado si está disponible y después al que lleva más tiempo sin recibir una oferta. Los propietarios y administradores actúan como respaldo. Sólo suena un endpoint durante 20 segundos. Cloud Tasks hace vencer ese intento y ofrece la llamada al siguiente endpoint compatible. Los endpoints API/SIP participan en el mismo orden, por lo que las aplicaciones del cliente pueden responder sin usar el inbox de Easyhook. Nunca se ofrece una llamada a un endpoint incapaz de transportar su audio.

Lea o actualice la política de un número con `GET /v1/call-routing` y
`PATCH /v1/call-routing`. Usa `?phone_id={id}` para un número Telnyx comprado,
o `?phone_id={id}&channel=whatsapp` para un teléfono WhatsApp.
La solicitud antigua sin `phone_id` se conserva sólo por compatibilidad para los
números que todavía no tienen una configuración propia. El portal siempre configura
un número concreto. Su política controla las llamadas entrantes normales, el respaldo
cuando la IA no contesta y las transferencias a una persona solicitadas por la IA.
`destinations` es una lista ordenada con un máximo de un destino `web`, uno `mobile`
y una lista de destinos `external_phone` de la organización en formato E.164.
La configuración de WhatsApp rechaza destinos `external_phone`. Sólo se ofrece
la llamada a un endpoint a la vez. El grupo de teléfonos externos selecciona un único
número; si no contesta, el siguiente intento pasa al portal o a la app móvil.
Los teléfonos con la misma prioridad usan `external_phone_strategy: "round_robin"` o `"random"`.

Las estrategias son `assigned_then_round_robin` (predeterminada), `round_robin` y
`api_only`. Se pueden configurar entre 8 y 30 segundos por intento y entre 1 y 20 intentos.
`api_only` desactiva expresamente el respaldo al portal, la app móvil y los teléfonos externos.
Los dispositivos de un mismo agente siguen siendo endpoints separados, pero sólo
el seleccionado recibe la oferta privada. Si se rechaza o vence, la llamada pasa
al siguiente endpoint elegible, en lugar de hacer sonar todos los dispositivos.

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

El tramo PSTN hacia un teléfono externo sólo se crea cuando le corresponde el turno.
Easyhook reserva primero saldo en la wallet de la organización para la duración máxima,
incluye el destino exacto en la autorización firmada del tramo, liquida el consumo
real según los eventos de costo verificados y devuelve la reserva no utilizada.
Un error de tarifa o saldo nunca provoca el uso de un número o saldo de otra organización.

Portal y móvil utilizan el mismo tiempo de ejecución a través de servidores autorizados `/admin/calls/*` rutas. El portal Vercel expone sólo un permitido bajo `/api/calls/*`, preserva la firma de organización/actor autenticado y nunca envía una clave de API de cliente al navegador o teléfono. Las llamadas iniciadas desde una bandeja de entrada utilizan la misma política de préstamo del proveedor: los costos de transportista facturados a Easyhook utilizan una reserva de billetera, mientras que WhatsApp Calling es facturado por Meta directamente a la WABA del cliente y por lo tanto no crea ninguna reserva de costo del proveedor Easyhook.

### Agentes de voz ElevenLabs (integración del portal)

Las organizaciones pueden conectar su propia clave API de ElevenLabs desde
Integraciones en el portal. Easyhook la valida y la guarda cifrada en el almacén
de secretos de la organización. Sólo expone el estado de conexión y los nombres
de sus agentes. La clave nunca se devuelve al navegador, la app móvil ni los webhooks del cliente.

El portal permite asignar un agente de ElevenLabs para llamadas entrantes y,
opcionalmente, otro para salientes a un número Telnyx activo de Easyhook. Ambos roles
pueden usar el mismo agente; Easyhook no selecciona implícitamente uno para las salientes.
Easyhook importa el número público para las entrantes y utiliza un identificador SIP
privado, no marcable, para las salientes. Telnyx envía el audio directamente a ElevenLabs;
Easyhook no lo retransmite ni transcribe. Cada número tiene su propia vinculación:

- `ai_only`: responde ElevenLabs; no se ofrece la llamada a un endpoint humano.
- `ai_then_agents`: ElevenLabs recibe el primer intento. Si no está disponible
  o el intento vence, se aplica el enrutamiento normal del equipo.

`human_transfer_enabled` es independiente del modo de respuesta inicial. Al activarlo,
Easyhook instala la herramienta de sistema administrada `transfer_to_number` en
el agente de ElevenLabs seleccionado. Una transferencia durante una conversación
activa con IA utiliza SIP REFER hacia un destino opaco de Easyhook firmado con HMAC.
Easyhook verifica la vinculación, la organización, el número y la sesión activa;
después aplica la misma política de destinos por número descrita arriba.
ElevenLabs nunca recibe la lista real de teléfonos externos. Se conservan las demás
herramientas del agente y las reglas de transferencia del cliente. El enrutamiento
`api_only` desactiva expresamente esta transferencia humana administrada.

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
