# Empieza con Easyhook

Conecta WhatsApp Business, Telegram o correo, genera una API key y envía tu
primer mensaje sin mantener por separado la infraestructura de cada proveedor.

## 1. Crea una organización

Entra al [portal de Easyhook](https://easyhook.dev/portal) y crea una organización. Una organización agrupa:

- Sus números y canales.
- Sus API keys.
- Su wallet.
- Sus webhooks e integraciones.

El saldo no expira. Necesitas saldo disponible para realizar envíos mediante la API pública.

## 2. Conecta WhatsApp

Abre **Conectar** y elige el modo correcto:

- **WhatsApp Coexistence:** conserva el número en WhatsApp Business App y úsalo también con Easyhook.
- **WhatsApp Cloud API:** usa un número nuevo de Meta o migra un número existente exclusivamente a la API.

Easyhook muestra una comparación visual antes de abrir Meta. Lee la advertencia completa: Coexistence termina con un QR y conserva la aplicación; Cloud API opera el número directamente y una migración deja de usar las aplicaciones de WhatsApp. Consulta el [recorrido completo](/onboarding).

## 3. Crea una API key

Abre **API**, crea una key con un nombre reconocible y guárdala. La key completa solo se muestra una vez.

## 4. Envía un mensaje

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Hola desde Easyhook"
  }'
```

`from` identifica el canal conectado. Easyhook resuelve internamente el WABA y Phone Number ID correctos, siempre dentro de la organización dueña de la API key.

## 5. Recibe eventos

Abre **Webhooks** para registrar un endpoint propio, o instala el nodo **Easyhook Trigger** en n8n. Las entregas de webhooks son gratuitas y usan firma HMAC.

## Siguiente paso

- Conecta [Telegram, Gmail, Outlook u otro correo](/channels).
- Consulta la [referencia completa de la API](/api-reference).
- Revisa el [contrato normalizado de webhooks](/webhooks).
- Instala la integración de [n8n](/n8n), [Chatwoot](/chatwoot) o [MCP para agentes](/ai-agents).
