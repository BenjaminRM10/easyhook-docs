# Inbox, equipos y app móvil

Easyhook incluye un Inbox multicanal en la web y una aplicación Android. Ambos
usan las mismas conversaciones, permisos, estados, media reutilizable y wallet.
Puedes atender WhatsApp, Messenger, Instagram, Telegram, Gmail, Outlook,
IMAP/SMTP, Mercado Libre, TikTok Business Messaging, Live Chat y conversaciones
internas sin cambiar de producto.

## Equipos sencillos

Una organización puede invitar integrantes por correo. El acceso y el rol se
aplican por organización, por lo que la misma persona puede ser administradora
en una y agente en otra.

- **Administrador:** administra la organización y trabaja en el Inbox.
- **Developer:** integra API, webhooks y herramientas técnicas.
- **Agente:** atiende conversaciones y usa media reutilizable.

Cuando hay más de un integrante, Easyhook activa asignación, presencia,
conversaciones asignadas a mí, conversaciones sin asignar, atribución del agente
y chats privados o grupales del equipo. En organizaciones de una sola persona,
estos controles permanecen ocultos para conservar una experiencia simple.

Los propietarios y administradores pueden abrir el engrane junto al estado de
presencia en el encabezado del Inbox y activar o desactivar la **autoasignación**.
Cuando está activa, Easyhook reparte las conversaciones nuevas en rotación entre
los integrantes disponibles con rol propietario, administrador o agente.

## Capacidades del Inbox

- Búsqueda remota y filtros combinables por canal, no leídas, fijadas y asignación.
- Realtime con caché local y actualización incremental.
- Texto, email HTML seguro, media, stickers, templates y botones compatibles.
- Replies, reacciones, edits, eliminaciones, typing y read receipts según el canal.
- Visualizador de media con navegación por los archivos de la conversación.
- Ventana de 24 horas y templates de WhatsApp aplicados por el servidor.
- Estado y salud de conexiones actualizados periódicamente.

## App Android

La app admite propietarios, administradores y agentes. Está pensada únicamente
para mensajería: conectar canales, recargar wallet, crear API keys o administrar
webhooks se realiza desde el portal web. Incluye notificaciones configurables,
deep links a la conversación, cache local, borradores y preferencia de idioma
ES/EN.

Sin filtros seleccionados, las notificaciones incluyen todas las organizaciones
a las que la cuenta tiene acceso. La selección de canales y la preferencia de
conversaciones asignadas se guardan por organización, para que un canal con el
mismo identificador en dos organizaciones no comparta configuración.

El APK oficial se descarga desde **Portal > Integraciones > Easyhook móvil**.
Android puede advertir que la instalación proviene fuera de Play Store mientras
la distribución sea directa. Verifica que la descarga provenga de
`easyhook.dev`.

## Facturación

Las acciones que llegan a un proveedor —enviar, responder, reaccionar, marcar
leído, typing y acciones de correo— consumen wallet al mismo precio por operación
que la API pública. Navegar, buscar, filtrar, recibir mensajes, usar caché,
recibir notificaciones y refrescar realtime no consume wallet.
