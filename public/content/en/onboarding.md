# Connect channels

Easyhook offers hosted onboarding for WhatsApp, Messenger, Instagram Direct,
Telegram, Gmail, Outlook, IMAP/SMTP email, Mercado Libre, and TikTok Business.
The following sections explain the two WhatsApp modes.

Easyhook uses Meta's official login. Choose the mode according to what should
happen to the number after it is connected.

| | WhatsApp Coexistence | WhatsApp Cloud API |
|---|---|---|
| App on the phone | Keeps working | Not used |
| Number | Active, eligible WhatsApp Business number | New Meta number or existing number |
| Last step | Scan a QR code | Register the number and its PIN when applicable |
| Use it when | The team needs to keep the app | The number will operate exclusively through the API |

> Before starting, confirm which mode the business needs. Migrating an existing
> number to Cloud API stops it from working in WhatsApp or WhatsApp Business App.

## WhatsApp Coexistence

Use Coexistence when the business needs to keep the number in WhatsApp Business App.

- The number must use WhatsApp Business, not personal WhatsApp.
- Meta determines if the number is eligible.
- You must open WhatsApp Business at least once every 14 days.
- A QR code is scanned during the registration.
- You can authorize initial synchronization of contacts and history.

### Coexistence tour

1. In Easyhook, open **Connect > WhatsApp Coexistence** and review the requirements.
2. In Meta's official window, select the correct portfolio, account, and number.
3. Authorize contacts and history only if you want to import them.
4. Open WhatsApp Business on your phone and scan the QR under **Linked devices**.
5. Go back to Easyhook and confirm that the channel appears active in **Organization**.

History and media availability depends on what Meta provides during onboarding.
Imported events are historical and must not trigger automatic replies.

## WhatsApp Cloud API

Use Cloud API when the number will work exclusively through the official platform:

- You can request a new number provided by Meta.
- You can migrate an existing number.
- An existing migrated number stops working in WhatsApp and WhatsApp Business App.

### Cloud API walkthrough

1. In Easyhook, open **Connect > WhatsApp API**.
2. Choose a new number provided by Meta or an existing number.
3. Select the correct portfolio and WABA within Meta.
4. Complete number registration and set the PIN when requested.
5. Confirm that the channel is active in Easyhook before generating an API key.

## Visual material

Meta screens change frequently. Easyhook keeps guidance diagrams in the portal,
while this page documents the current contract. Tutorials with real screenshots
will be published after they are recorded with a demo account. Never reuse a QR
code, token, or production number from an old screenshot.

## Onboarding hosted for your customers

An API key can create a session hosted on `easyhook.dev`. The completed channel
is automatically registered in the organization that owns that key.
The same contract connects WhatsApp, Messenger, Instagram Direct, Telegram,
Gmail, Outlook, IMAP/SMTP mail, Mercado Libre and TikTok Business.

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

Subscribe to `onboarding.*` to receive the result without polling the session.

To create the session and send the link in a single call:

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions/send \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "provider": "gmail",
    "language": "es"
  }'
```

`provider` accepts `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre` or `tiktok`. `signup_mode` is used only with
WhatsApp and accepts `coexistence` or `cloud_api`. The link expires at a maximum of
one hour and is consumed when the connection is completed. Sending it from a
WhatsApp number requires an open customer-service window.

The `onboarding.completed` event enters the same durable queue as other customer
webhooks. Easyhook preserves the attempt, retries with backoff, and records each
delivery so a temporary failure does not lose the event.

### Messenger: Pages available

For Messenger, Easyhook lists only Pages that the user explicitly authorized
for `pages_messaging`. Administrative access to the Page or authorization of
other permissions is not sufficient.
If Meta completes the login but does not deliver a page token with that permission,
Easyhook responds `meta_page_access_unavailable`. Repeat the authorization and
explicitly select the correct Page in Facebook Login for Business.

## Disconnect an API channel

First, get the canonical identifier with `GET /v1/senders` and use its
`account_id`:

```bash
curl -X DELETE https://api.easyhook.dev/v1/senders/ACCOUNT_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

The operation can only affect channels belonging to the organization that owns
the API key and requires `onboarding:write`; existing keys with only
`messages:write` cannot disconnect channels. Disconnecting removes Easyhook's
credentials, stops Easyhook-managed refreshes and webhooks, and does not delete
previously received history. Use this call only after explicit user
confirmation; it is not exposed as a destructive MCP tool.

TikTok opens Business Account OAuth and requests only
`message.list.read`, `message.list.send` and `message.list.manage`. The account must
be outside the United States, EEA, Switzerland and United Kingdom.
