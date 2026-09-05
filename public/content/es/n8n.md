# n8n-nodes-easyhook

Nodo comunitario n8n verificado para usar Easyhook.

Easyhook es una API de mensajería multicanal ligera para WhatsApp, Messenger,
Instagram, Telegram, TikTok Business, Gmail, Outlook, correo electrónico genérico IMAP/SMTP,
y Mercado Libre.

- `Message Action` grupos de texto y medios de comunicación cruzados envía.
- `Message Control` grupos leer, escribir, responder y acciones de reacción y sólo
  lista los remitentes que apoyan el control seleccionado.
- `Email Only` funciona de la misma manera con Gmail, Outlook y IMAP/SMTP: enviar,
  réplica, adelante, marcar leer / leer, archivo, y crear / editar / enviar borradores.
- `Onboarding` crea enlaces de conexión alojados para cualquier canal soportado.
- `WhatsApp Only` grupos WhatsApp envía, plantillas, flujos y consentimiento.
- `Template` lista, sincroniza, comprueba categorías, crea y elimina plantillas.
- Utilice la entrega estándar o humanizada con WhatsApp, Messenger, Instagram y Telegram.
- Mensajes programados con Easyhook `at` parámetro
- Subir los medios reutilizables y enviarlo más tarde por `media_name`
- Plantillas y medios de comunicación de lista/sinc
- Cancelar los mensajes programados antes de comenzar el procesamiento
- Crear enlaces a bordo para canales compatibles
- Enviar Easyhook Op-in y Flows de exclusión
- Recibir eventos de Webhook Easyhook en n8n con el nodo de Easyhook

## Instala

En n8n, abrir **Configuración √° Comunidad Nodos** e instalar:

```text
n8n-nodes-easyhook
```

Para el n8n auto hospedado, también puede instalarlo manualmente en su carpeta n8n nodos personalizados.

## Credenciales

Crear un **Easyhook API** credencial:

- Clave de API: su `eh_live_...` llave de Easyhook
n8n valida la credencial con `GET /v1/me`, por lo que no se necesita el número de WhatsApp sólo para probar la clave de API.

## Ejemplos comunes

### Recibir Webhooks

Use **Easyhook Trigger** como el primer nodo en un flujo de trabajo.

1. Añadir el nodo de Easyhook Trigger.
2. Seleccione su credencial de Easyhook API.
3. Elija un proveedor. Easyhook filtra automáticamente los eventos disponibles y los tipos de alcance.
4. Para WABAs, números WhatsApp, Páginas de Messenger o cuentas de Instagram, seleccione una cuenta conectada de la lista cargada con su credencial API.
5. Activar el flujo de trabajo.

n8n registra su URL de producción en Easyhook automáticamente y almacena el secreto de firma HMAC en los datos estáticos privados del flujo de trabajo. Desactivar o eliminar el flujo de trabajo elimina la suscripción de Easyhook. No se requiere configuración del portal o copia secreta/paste.

WhatsApp utiliza los mismos tres niveles que el portal Easyhook: **Entire Organization → WABA → WhatsApp Number**. La selección de un WABA recibe eventos coincidentes de todos los números conectados a él. Meta Business Portfolios permanecen internos y nunca aparecen como alcances n8n.

El gatillo produce el Webhook Easyhook normalizado JSON directamente.

### Mercado Libre

Elija `Mercado Libre` en el Easyhook Trigger para recibir preguntas de producto
y mensajes post-venta. Para responder, utilice **Message Action  Confeccionar texto**, seleccione el texto
vendedor conectado como **Desde**, y el mapa `contact.id` desde el gatillo en
**Para**. El valor será `question:<id>` o `pack:<id>`.

No sustituya ese destino con un ID del comprador. Mercado Libre requiere el
cuestionar o vender el contexto del paquete y no permite conversaciones arbitrarias.

### Enviar texto

- Recursos: `Message Action`
- Operación: `Send Text`
- Canal: seleccione un canal conectado
- A: `15550100003`
- Cuerpo: `Hello from n8n`

El selector del canal almacena el mismo identificador nativo del proveedor entregado como
`account.id` por Easyhook webhooks. Mapa directamente sin añadir `page_` o
`ig_`. WhatsApp también acepta su Meta Phone Number ID.

Elija **Entrega: Humanizado** cuando desea que Easyhook aplique el texto de lectura/tipificación
secuencia soportada por el proveedor seleccionado antes de enviar.
el último inbound `wamid`; Telegram utiliza la escritura sin fabricar una lectura
Recibido.

Para las plantillas programadas de texto, medios de comunicación o WhatsApp, agregue:

- `Schedule At`: Tiempo de ejecución ISO 8601
- `Options > Client Reference`: identificador opcional de su aplicación
- `Options > Idempotency Key`: llave estable opcional usada sólo al reiniciar el mismo envío programado

La programación de textos y medios funciona con WhatsApp, Messenger, Instagram y
Telegram. TikTok y Mercado Libre apoyan el texto programado.
del actual contrato público.

Uso recurso **Cancel Mensaje programado** cuando usted necesita cancelar un envío antes de comenzar el procesamiento. La reconciliación permanece disponible a través de la API de Easyhook y webhooks.

Bajo **A bordo** se puede crear un enlace a bordo o crear y enviar eso
enlace, luego elegir el proveedor de destino.
Coexistencia o Cloud API. Bajo **WhatsApp Sólo** usted puede enviar el consentimiento Flujo
o registrar pruebas opt-in/opt-out recogidas por un sitio web o CRM.

### Enviar correo electrónico

- Recursos: `Email Only`
- Operación: `Send Email`
- Correo electrónico: seleccione un Gmail conectado, Outlook, o dirección IMAP/SMTP
- Para Correo electrónico: correo electrónico destinatario
- Tema: asunto del mensaje
- Mensaje: contenido de texto plano
- Mensaje HTML: cuerpo rico opcional

Para responder a un correo electrónico existente, seleccione `Reply to Email` y mapa `message.id` desde
the Easyhook Trigger into **Original Email ID**. Easyhook resuelve el Gmail
hilo, respuesta nativa de Outlook, o cabeceras IMAP automáticamente. El nodo no
pedir `Thread ID`, `In-Reply-To`, `References`.

La lista de correo electrónico contiene solamente cuentas de correo electrónico conectadas a la API-key
organización; Números de WhatsApp y otros canales están excluidos.
proveedores de uso `POST /v1/messages/email`, por lo que un flujo de trabajo no necesita
ramas específicas del proveedor.

Para adjuntar archivos, añadir entradas bajo **Ajustes** y seleccionar cada entrada
campo binario. Easyhook utiliza el nombre de archivo binario y el tipo MIME automáticamente;
las anulaciones opcionales sólo se necesitan cuando los metadatos binarios entrantes
incompleta.

Otras operaciones de correo electrónico:

- `Forward Email`: mapea el gatillo `message.id`, elegir el destino, y
  opcionalmente añadir una nota.
- `Update Email`: mapa `message.id` y elegir leer, leer o archivar.
- `Create Email Draft`: ingresar destinatario, sujeto, mensaje, HTML opcional, y
  apegos.
- `Edit Email Draft`: proporcionar el Borrador de ID devuelto y el contenido de reemplazo.
- `Send Email Draft`: proporcionar el Borrador de ID y conectado de correo electrónico.

### Read, Typing, Reply, Or Reaction

- Recursos: `Message Control`
- Operación: `Mark as Read`, `Show Typing`, `Reply`, `React`
- Canal: seleccione un remitente conectado compatible
- ID del mensaje: mapa del webhook normalizado `message.id`

WhatsApp admite los cuatro controles. Soporte Mensajero, Instagram y TikTok
leer, escribir y responder. Telegram es compatible con escribir, responder y reaccionar.
los pares de proveedor/operación se omiten de la lista del remitente y son rechazados por el
API sin facturación.

### TikTok Business

Elija `TikTok Business` en el gatillo y el mapa `account.id` directamente a
**De**. Mapa de la conversación opaca/identificador de contacto del elemento entrante
a **To**. No añadir un prefijo o convertirlo en un número de teléfono. TikTok no
permitir conversaciones iniciadas por el negocio y limitar el negocio a 10 respuestas
dentro de 48 horas después de cada mensaje del usuario.

### Enviar medios reutilizables

Primera subida de medios:

- Recursos: `Media`
- Operación: `Upload`
- Nombre: `promo_image`
- Tipo: `Image`
- Fuente: `Binary Property`
- Propiedad binaria: `data`

El activo pertenece a la organización Easyhook y puede ser reutilizado por todos
canal conectado compatible. Entonces envíelo:

- Recursos: `Message Action`
- Operación: `Send Media`
- Canal: seleccione un canal conectado compatible
- A: cliente WhatsApp ID
- Tipo: `Image`
- Tipo de referencia de medios: `Reusable Media Name`
- Nombre de los medios: `promo_image`

### Descargar Incoming Media

Las URL entrantes de Webhook son privadas.

- Recursos: `Media`
- Operación: `Download`
- URL de medios: `{{$json.message.media.url}}`
- Campo binario de salida: `data`

El nodo autentica con la credencial Easyhook y devuelve n8n binario
datos. Apertura de la URL directamente en un navegador sin autorización se espera
fracasar.

### Enviar plantilla

- Recursos: `WhatsApp Only`
- Operación: `Send Template`
- Fuente de la plantilla: `Enter Manually`
- Nombre de plantilla: el nombre de plantilla aprobado en Easyhook/Meta
- Idioma: Seleccione el código de idioma Meta de la lista, por ejemplo `es_MX` o `en_US`
- Datos de plantilla: elija `Map Automatically` para cargar la definición de plantilla por nombre e idioma, o `Custom Components (JSON)` para proporcionar componentes brutos.

Ambas fuentes de plantilla soportan los mismos modos de datos. `Choose From Easyhook` selecciona una plantilla aprobada de una lista; `Enter Manually` resuelve la plantilla aprobada usando el nombre tipo y el idioma seleccionado. `Map Automatically` entonces crea sólo los campos requeridos en el tiempo de envío:

- Variables de texto del encabezado
- Imagen del encabezado, vídeo o documento URL y nombre de archivo opcional
- Campos de ubicación de los jefes
- Variables corporales, incluidas variables nombradas
- Valores dinámicos del botón URL
- Quick reply payloads
- Valores de cupón de código

Para los encabezados de imagen, vídeo o documento, la URL del encabezado mapeado reemplaza el ejemplo de aprobación para eso
individual envía. Déjalo vacío sólo cuando la plantilla tiene un activo de aprobación predeterminado almacenado en Easyhook.
El tipo de medios dinámicos debe coincidir con el tipo de encabezado aprobado de la plantilla. `Custom Components (JSON)` puede
en lugar de proporcionar un encabezado de medios Meta crudo utilizando `id` o un HTTPS `link`.

Uso `Custom Components (JSON)` cuando usted necesita proporcionar Meta cruda `components`. El valor puede ser un array de componentes o `{ "components": [...] }`. El texto de la plantilla sigue siendo fijado por la plantilla Meta aprobada.

Cabecera de texto, variables del cuerpo y botón de URL dinámico:

```json
[
  {
    "type": "header",
    "parameters": [{ "type": "text", "text": "PED-1048" }]
  },
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "Example User" },
      { "type": "text", "text": "15 July" }
    ]
  },
  {
    "type": "button",
    "sub_type": "url",
    "index": "0",
    "parameters": [{ "type": "text", "text": "PED-1048" }]
  }
]
```

Media header and named body variable:

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
            "filename": "invoice.pdf"
          }
        }
      ]
    },
    {
      "type": "body",
      "parameters": [
        {
          "type": "text",
          "parameter_name": "customer_name",
          "text": "Example User"
        }
      ]
    }
  ]
}
```

Los enlaces multimedia deben utilizar HTTPS y ser descargables por Meta sin autenticación. Un valor de botón de URL dinámico es el sufijo variable, no la URL completa. `[]` cuando la plantilla no tiene componentes de tiempo de ejecución.

### Enviar WhatsApp Flow

- Recursos: `WhatsApp Only`
- Operación: `Send Flow`
- Desde: su número de remitente de WhatsApp
- Para: número de cliente WhatsApp
- Nombre del flujo: el nombre del flujo Easyhook
- Cuerpo del mensaje: el texto por encima del botón del flujo
- Texto del botón: la etiqueta del botón de flujo
- Datos de flujo: campos opcionales de clave/valor enviados como la carga útil de flujo

### Consentimiento y acogida a bordo

Bajo ** WhatsApp Sólo**:

- **Enviar Opt-In o Opt-Out** envía el consentimiento de WABA a un contacto de WhatsApp.
- **Get Consent Status** devuelve tanto el consentimiento de servicio como de marketing para un
  contacto bajo el remitente WhatsApp seleccionado.

Bajo **A bordo**:

- **Get Onboarding URL** crea un enlace de Easyhook hospedado para WhatsApp,
  Mensajero, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP, o Mercado Libre.
  La conexión está registrada bajo la organización que posee la API
  credencial.
- **Enviar Enlace a bordo** crea la misma sesión y envía su
  URL en un mensaje localizado de WhatsApp.

Bajo **Template**:

- **Comprobar Categoría** devuelve asesoramiento de categoría no bloqueante antes de su presentación.
- **Crear** presenta la plantilla solicitada y devuelve la misma advertencia cuando
  su clasificación seleccionada puede ser inconsistente.

### Llamadas de voz AI

Versión `0.2.39` **Voice Call**:

- **Consentimiento de disco** almacena evidencia explícita opt-in o opt-out para uno
  Número de Easyhook y contacto.
- **Iniciar la llamada AI** comienza el agente de once laboratorios seleccionado explícitamente asignado a
  requiere una duración máxima y una clave de idempotencia estable.
- **Get Call** lee estado normalizado; **Hang Up** lo termina.

Easyhook sigue imponiendo la propiedad organización, consentimiento, frecuencia de extensión, número
capacidades, reserva de cartera y liquidación final del transportista. n8n proporciona
las herramientas de automatización y agente; no se coloca en la vía de audio en tiempo real.

### Automatización Webhook

Easyhook webhooks se manejan con **Easyhook Trigger**. No es un nodo de votación: la activación crea un `/v1/webhooks` suscripción para la URL de producción n8n y la desactivación lo elimina. Las entregas se autentican automáticamente con `X-Easyhook-Signature: sha256=<hex>`.

El gatillo comienza sin proveedor o eventos seleccionados. Elija un proveedor y
por lo menos un evento compatible. Nombres y valores coinciden con el portal y
`GET /v1/webhooks/options`; `All events` debe ser seleccionado por sí mismo.

Alcances útiles del evento:

- `message.*`: mensajes entrantes WhatsApp/Messenger/Instagram
- `message.quick_reply`: WhatsApp, Messenger, Instagram, o selección de botones de respuesta de Telegram con `message.text` y `message.quick_reply.payload`
- `status.*`: entrega de mensajes/read/failure status
- `template.*`: cambios de estado de plantilla
- `flow.submission.*`: WhatsApp Flow responses
- `smb_message_echo.*`: WhatsApp Business El mensaje de convivencia de App se hace eco
- `smb_app_state_sync.*`: WhatsApp Business App coexistencia contacto/app state sync
- `history.*`: historia de la coexistencia sincronía eventos
- `account_update.*`: Actualizaciones de la cuenta WhatsApp
- `media.*`: eventos de ciclo de vida de los medios, cuando está habilitado en Easyhook
- `message.text`, `message.image`, `status.failed`: filtros de evento más estrechos que coinciden con el portal Easyhook

Para los flujos de trabajo de correo electrónico seleccione `Gmail`, `Outlook`, `Email (IMAP/SMTP)` como el
proveedor de desencadenación y `message.*`. El correo electrónico entrante expone `message.subject`,
`message.text`, opcional `message.html`, `message.thread_id`, y respuesta RFC
encabezados. Una solicitud webhook crea una ejecución n8n; eventos normales no sincronizados
producir un artículo.

Los ganchos Messenger e Instagram están configurados en el portal Easyhook con el filtro del proveedor. En n8n también se puede etiquetar un disparador como `messenger.message.*` o `instagram.message.*` para la claridad del flujo de trabajo.

Para un contrato común a través de WhatsApp, Messenger, Instagram y Telegram, use
**Mensaje Acción <unk> Enviar Botones** y añadir hasta tres botones de respuesta o URL.
WhatsApp acepta hasta tres respuestas o una URL sin mezclar ambos tipos.
Messenger e Instagram exponen además **Enviar Respuestas Rápidas** para menús de
hasta 13 opciones de texto. Respuesta de ruta selecciones utilizando
`{{$json.message.quick_reply.payload}}`; la etiqueta visible está disponible
`{{$json.message.text}}`.

### Recibir historia de la coexistencia

Configure el **Easyhook Trigger** antes de conectar el número de App Business App de WhatsApp o solicitar la sincronización de coexistencia:

1. Seleccione `Provider: WhatsApp`.
2. Seleccione `Event: Coexistence history (history.*)`.
3. Elija la organización, WABA o el alcance del número de WhatsApp.
4. Activar el flujo de trabajo.
5. Permitir compartir la historia en la App Business de WhatsApp y mantener la aplicación abierta mientras comienza la sincronización.

Easyhook crea la suscripción webhook y almacena su secreto HMAC en n8n automáticamente. No crea un segundo portal webhook. `message.*` sólo cubre los mensajes en vivo; no incluye las importaciones de historia.

Easyhook ofrece datos de sincronización en lotes de la mayoría de 100 eventos. Un lote comienza una ejecución de flujo de trabajo, y el gatillo lo expande en un artículo n8n por evento. `type: message.received`; uso de mensajes externos históricos `type: message.echo`. Ambos incluyen `message.source: history`. Cada artículo ampliado también incluye `_sync` con los metadatos del período de sesiones, cursor y progreso:

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "message": {
    "id": "wamid...",
    "direction": "out",
    "source": "history",
    "type": "text",
    "text": "Previous reply",
    "history": {
      "thread_id": "15550100004",
      "status": "READ",
      "phase": 1,
      "chunk_order": 2,
      "progress": 80
    }
  }
}
```

Uso `message.id` como la clave de la idempotencia. Un destino fallido es retriado hasta cinco veces, por lo que los flujos de trabajo deben tolerar recibir el mismo artículo de nuevo. Los mensajes se ordenan dentro de cada conversación, pero diferentes conversaciones pueden progresar simultáneamente.

Los medios históricos no retrasan la importación del mensaje. El primer artículo puede contener `message.media.storage_status: pending`; una vez que Easyhook termine de descargar un activo Meta disponible, el gatillo recibe un segundo elemento con `type: message.media_available` y el mismo `message.id`.

Si el negocio desactiva el intercambio de historia, Meta puede devolver el error `2593109`; el gatillo lo recibe como `type: sync.failed` bajo el mismo `history.*` selección.

## Desarrollo

```bash
cd packages/n8n-nodes-easyhook
npm install
npm run build
npm pack --dry-run
```

Antes de presentar para la verificación n8n, publicar a través de GitHub Actions con la procedencia npm según lo requerido por las actuales guías de n8n de ganglios comunitarios.
