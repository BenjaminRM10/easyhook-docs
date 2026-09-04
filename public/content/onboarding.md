# Conectar canales

Easyhook ofrece onboarding alojado para WhatsApp, Messenger, Instagram Direct,
comentarios de Facebook, comentarios de Instagram,
Telegram, Gmail, Outlook, correo IMAP/SMTP, Mercado Libre y TikTok Business. Las siguientes
secciones explican las dos modalidades específicas de WhatsApp.

Easyhook usa el registro insertado oficial de Meta. Elige el modo según lo que debe ocurrir con el número después de conectarlo.

| | WhatsApp Coexistence | WhatsApp Cloud API |
|---|---|---|
| App en el teléfono | Sigue funcionando | No se utiliza |
| Número | Número activo y elegible en WhatsApp Business | Número nuevo de Meta o número existente |
| Último paso | Escanear un código QR | Registrar el número y su PIN cuando corresponda |
| Úsalo cuando | El equipo necesita conservar la aplicación | El número operará exclusivamente mediante API |

> Antes de comenzar, confirma qué modalidad necesita el negocio. Cambiar un número existente a Cloud API puede impedir que vuelva a utilizarse en WhatsApp o WhatsApp Business App.

## WhatsApp Coexistence

Usa Coexistence cuando el negocio necesita conservar el número en WhatsApp Business App.

- El número debe usar WhatsApp Business, no WhatsApp personal.
- Meta determina si el número es elegible.
- Debes abrir WhatsApp Business al menos una vez cada 14 días.
- Durante el registro se escanea un código QR.
- Puedes autorizar la sincronización inicial de contactos e historial.

### Recorrido de Coexistence

1. En Easyhook abre **Conectar > WhatsApp Coexistence** y revisa los requisitos.
2. En la ventana oficial de Meta selecciona el portafolio, la cuenta y el número correctos.
3. Autoriza contactos e historial únicamente si deseas importarlos.
4. Abre WhatsApp Business en el teléfono y escanea el QR desde **Dispositivos vinculados**.
5. Regresa a Easyhook y confirma que el canal aparece activo en **Organización**.

La disponibilidad de historial y media depende de lo que Meta entregue durante el onboarding. Los eventos de importación son históricos y no deben activar respuestas automáticas.

## WhatsApp Cloud API

Usa Cloud API cuando el número funcionará exclusivamente mediante la plataforma oficial:

- Puedes solicitar un número nuevo proporcionado por Meta.
- Puedes migrar un número existente.
- Un número existente migrado deja de funcionar en WhatsApp y WhatsApp Business App.

### Recorrido de Cloud API

1. En Easyhook abre **Conectar > WhatsApp API**.
2. Elige un número nuevo proporcionado por Meta o un número existente.
3. Selecciona el portafolio y la WABA correctos dentro de Meta.
4. Completa el registro del número y define el PIN cuando se solicite.
5. Confirma el canal activo en Easyhook antes de generar una API key.

## Material visual

Las pantallas de Meta cambian con frecuencia. Easyhook mantiene diagramas de orientación dentro del portal y esta página conserva el contrato vigente. Los tutoriales con capturas reales se publicarán aquí después de grabarlos con una cuenta de demostración; nunca uses un código QR, token o número de producción tomado de una captura antigua.

## Onboarding alojado para tus clientes

Una API key puede crear una sesión alojada en `easyhook.dev`. El canal
completado se registra automáticamente en la organización dueña de esa key.
El mismo contrato conecta WhatsApp, Messenger, Instagram Direct, comentarios de
Facebook, comentarios de Instagram, Telegram, Gmail,
Outlook, correo IMAP/SMTP, Mercado Libre y TikTok Business.

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "whatsapp",
    "signup_mode": "coexistence",
    "language": "es",
    "return_url": "https://app.example.com/channels"
  }'
```

Suscríbete a `onboarding.*` para recibir el resultado sin consultar repetidamente la sesión.

Para crear la sesión y enviar el enlace en una sola llamada:

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions/send \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5218661479075",
    "to": "5215660069997",
    "provider": "gmail",
    "language": "es"
  }'
```

`provider` acepta `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre` o `tiktok`. `signup_mode` se usa solamente con
WhatsApp y acepta `coexistence` o `cloud_api`. El enlace expira en un máximo de
una hora y se consume al completar una conexión. Enviarlo desde un número de
WhatsApp requiere una ventana de atención abierta.

El evento `onboarding.completed` entra en la misma cola durable que los demás
webhooks del cliente. Easyhook conserva el intento, aplica reintentos con
backoff y registra cada entrega para que una respuesta temporalmente fallida no
se pierda.

### Messenger: Pages disponibles

En Messenger, Easyhook enumera únicamente Pages que el usuario autorizó de
forma específica para `pages_messaging`; no toma como suficiente que el usuario
tenga acceso administrativo a la Page o que haya autorizado otros permisos.
Si Meta completa el login pero no entrega un token de Page con ese permiso,
Easyhook responde `meta_page_access_unavailable`. Repite la autorización y
selecciona explícitamente la Page correcta dentro de Facebook Login for
Business.

## Desconectar un canal por API

Obtén primero el identificador canónico con `GET /v1/senders` y usa su
`account_id`:

```bash
curl -X DELETE https://api.easyhook.dev/v1/senders/ACCOUNT_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

La operación sólo puede afectar canales de la organización dueña de la API key
y requiere `onboarding:write`; las keys existentes con `messages:write`
conservan compatibilidad. La desconexión elimina credenciales de Easyhook,
detiene renovaciones y webhooks administrados por Easyhook, y no borra el
historial ya recibido. Usa esta llamada únicamente después de una confirmación
explícita del usuario; no se expone como herramienta destructiva del MCP.

TikTok abre el OAuth de cuenta Business y solicita únicamente
`message.list.read`, `message.list.send` y `message.list.manage`. La cuenta debe
estar fuera de Estados Unidos, EEE, Suiza y Reino Unido.
