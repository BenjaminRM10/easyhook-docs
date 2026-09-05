# Getting started with Easyhook

Connect WhatsApp Business, Telegram, or email, generate an API key, and send
your first message without maintaining separate infrastructure for each provider.

## 1. Create an organization

Open the [Easyhook portal](https://easyhook.dev/portal) and create an organization. An organization contains:

- Your numbers and channels.
- Your API keys.
- Your wallet.
- Your webhooks and integrations.

The balance does not expire. You need the balance available for sending through the public API.

## 2. Connect WhatsApp

Open **Connect** and choose the appropriate mode:

- **WhatsApp Coexistence:** keeps the number in WhatsApp Business App and also lets you use it with Easyhook.
- **WhatsApp Cloud API:** uses a new Meta number or migrates an existing number exclusively to the API.

Easyhook shows a visual comparison before opening Meta. Read the full warning:
Coexistence ends with a QR scan and keeps the app working; Cloud API operates
the number directly, and migrating an existing number stops it from working in
WhatsApp apps. See the [complete guide](/onboarding).

## 3. Create an API key

Open **API**, create a key with a recognizable name and save it. The complete key is only shown once.

## 4. Send a message

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Hello from Easyhook"
  }'
```

`from` identifies the connected channel. Easyhook resolves the correct WABA and
Phone Number ID internally, always within the organization that owns the API key.

## 5. Receive events

Open **Webhooks** to register your own endpoint, or install the **Easyhook
Trigger** node in n8n. Webhook deliveries are free and use HMAC signatures.

## Next step

- [Telegram, Gmail, Outlook or other mail](/channels).
- See the [full API reference](/api-reference).
- Check the [standard webhooks contract](/webhooks).
- Install the [n8n](/n8n), [Chatwoot](/chatwoot), or [MCP for agents](/ai-agents) integration.
