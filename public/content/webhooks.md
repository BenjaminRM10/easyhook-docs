# Easyhook Webhooks

Last updated: 2026-08-20

Easyhook sends one compact JSON object per event. The format is shared by
WhatsApp, Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP email,
Mercado Libre, TikTok Business Messaging, and Google Business Profile.

## Principles

- `id` is the only Easyhook UUID exposed. Use it to deduplicate events.
- `channel` identifies the provider: `whatsapp`, `messenger`, `instagram`,
  `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, or
  `google_business_profile`.
- Account, contact, and message identifiers come from Meta, not from Easyhook's database.
- For Telefonía, `account.id` is always the purchased business number for both
  inbound and outbound events. SMS/MMS use `channel: "sms"`; call lifecycle
  events use `channel: "voice"`.
- Blocks that do not apply are omitted. Easyhook does not send placeholder `null` fields.
- Provider-specific details used for debugging remain in the `X-Easyhook-Provider-Event` header.
- Raw Meta payloads remain internal and are not forwarded.

### Telefonía

```json
{
  "id": "event_uuid",
  "type": "call.initiated",
  "channel": "voice",
  "account": { "id": "+13125550100" },
  "contact": { "id": "+13125550999", "phone": "+13125550999" },
  "call": {
    "id": "call_uuid",
    "direction": "inbound",
    "from": "+13125550999",
    "to": "+13125550100",
    "status": "ringing",
    "occurred_at": "2026-08-26T20:00:00.000Z"
  }
}
```

Call types are `call.initiated`, `call.answered`, `call.ended`, and
`call.cost_updated`. SMS/MMS reuse `message.*` and the same `account.id`.

## Text Message

```json
{
  "id": "7ef9509d-8dc2-43d5-9887-1eb7abe3a12e",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {
    "id": "980912725115744",
    "phone": "5218661479075"
  },
  "contact": {
    "id": "5214445087305",
    "name": "webgeoapm"
  },
  "message": {
    "id": "wamid.HBg...",
    "type": "text",
    "text": "como estas",
    "timestamp": "2026-07-10T23:03:40.000Z"
  }
}
```

The same event from Messenger or Instagram only changes `channel` and the provider IDs:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841401731804358" },
  "contact": { "id": "IGSID_VALUE", "name": "Customer" },
  "message": {
    "id": "mid...",
    "type": "text",
    "text": "hello",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

TikTok uses the same normalized envelope. `account.id` is the connected
Business Account open ID, `contact.id` is the stable TikTok user identifier,
and `message.thread_id` is the conversation identifier required by TikTok.
All three values and message IDs are opaque and must not be reformatted.
Easyhook accepts either `contact.id` or `message.thread_id` as `to` for an
existing TikTok conversation. A TikTok reply-button
selection uses the same `message.quick_reply` block as other supported
channels. Provider privacy restrictions are emitted as a non-message event
rather than fabricating unavailable message data.

Email providers use the same event with email-specific fields:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "outlook",
  "account": { "id": "support@example.com", "name": "Support" },
  "contact": { "id": "customer@example.net", "name": "Customer" },
  "message": {
    "id": "provider-message-id",
    "type": "text",
    "text": "I need help",
    "subject": "Order 1048",
    "html": "<p>I need <strong>help</strong></p>",
    "thread_id": "provider-thread-id",
    "message_id_header": "<message@example.net>",
    "is_read": false,
    "inference_classification": "focused",
    "attachments": [{
      "media_asset_id": "asset_uuid",
      "filename": "invoice.pdf",
      "content_type": "application/pdf",
      "size": 48210
    }],
    "timestamp": "2026-07-27T16:37:02.000Z"
  }
}
```

`channel` can instead be `gmail` or `imap_smtp`. Treat `message.html` as
untrusted input and render it only after sanitization or inside a sandbox.

Mercado Libre questions and post-sale messages use the same envelope:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "mercadolibre",
  "account": { "id": "123456789", "name": "EASYHOOK_STORE" },
  "contact": { "id": "question:987654321", "name": "Comprador 456789" },
  "message": {
    "id": "question:987654321",
    "direction": "in",
    "type": "text",
    "text": "¿Todavía está disponible?",
    "from": "question:987654321",
    "to": "123456789",
    "timestamp": "2026-07-28T04:00:00.000Z"
  }
}
```

Use `contact.id` or `message.from` as `to` when replying. Product questions
arrive as `question:<id>` and post-sale conversations as `pack:<id>`.

## Public Subscription API

The API key determines the organization. Never send `tenant_id`.

WhatsApp scopes follow the same three-level hierarchy shown in the Easyhook portal and n8n:

1. **Organization**: every connected WABA and number owned by the API key.
2. **WABA**: every number inside one WhatsApp Business Account.
3. **Phone**: one specific WhatsApp sender number.

Meta Business Portfolios are retained internally as onboarding metadata. They are not a public Easyhook scope and are never required in customer API calls. WABA identity is based on Meta's `waba_id`, not its display name.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/v1/webhooks` | List subscriptions. |
| `GET` | `/v1/webhooks/options` | List compatible events, scopes, and connected accounts for the API-key tenant. |
| `POST` | `/v1/webhooks` | Create a subscription and return its secret once. |
| `GET` | `/v1/webhooks/{id}` | Read one subscription. |
| `PATCH` | `/v1/webhooks/{id}` | Replace the subscribed events without changing the URL, secret, authentication, provider, or scope. |
| `DELETE` | `/v1/webhooks/{id}` | Delete one subscription. |
| `POST` | `/v1/webhooks/{id}/replay` | Requeue failed/dead deliveries for this subscription. |
| `POST` | `/v1/webhooks/{id}/history-replays` | Re-send stored History messages or App State contacts. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | Read persistent replay progress. |

Create an organization-wide subscription:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "auth_type": "hmac",
    "scope": { "type": "organization" }
  }'
```

Creation fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Human-readable subscription name. |
| `url` | yes | Public HTTPS destination. HTTP and invalid URLs are rejected. |
| `providers` | yes | One or more providers: `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `google_business_profile`, or `*`. Select `*` alone. |
| `events` | yes | One or more compatible filters from `/v1/webhooks/options`. Empty is rejected. Select `*` alone for every event. |
| `scope` | no | Public nested scope object. Defaults to the whole organization. |
| `auth_type` | no | `hmac` (default), `bearer`, `custom_header`, or `none`. |
| `auth_header_name` | only for `custom_header` | Safe custom header name. `Authorization`, transport headers, and `X-Easyhook-*` are reserved. |

Update only the subscribed events after creation:

```bash
curl -X PATCH https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": ["message.*", "status.*", "consent.updated"]
  }'
```

`events` replaces the previous event selection and must contain at least one
event compatible with the webhook's existing providers. This operation does
not rotate or return the secret and does not recreate the subscription.

Successful creation returns HTTP `201`. Save `secret` immediately; list/get
calls never return it:

```json
{
  "webhook": {
    "id": "webhook_uuid",
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "scope": { "type": "organization", "ref": null },
    "auth": { "type": "hmac", "header_name": null },
    "status": "active"
  },
  "secret": "whsec_..."
}
```

Available scopes:

```json
{ "type": "organization" }
```

```json
{ "type": "phone", "from": "5218661479075" }
```

```json
{ "type": "waba", "from": "5218661479075" }
```

```json
{ "type": "channel", "from": "instagram_alias" }
```

For `phone` and `waba`, Easyhook resolves the internal scope from the WhatsApp
number. A WABA subscription receives matching events from all numbers currently
connected to that WABA. For `channel`, use the public alias returned for a
Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP, Mercado Libre, or
Google Business Profile channel. Internal
scope IDs and Meta Business Portfolio IDs are never needed.

WhatsApp scope numbers follow the same international normalization as the
message API: E.164 or digits-only with a country calling code, common visual
separators, Mexico `52`/`521`, and Argentina mobile `54`/`549` are accepted.
National-only numbers are not inferred.

Discover valid choices without hardcoding identifiers:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

`provider` accepts `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre`, `google_business_profile`, or `*`.
`scope_type` accepts `organization`, `waba`,
`phone`, or `channel`. The response filters incompatible combinations and
returns `providers`, `events`, `scope_types`, and `scope_identifiers`.
Connected-account values are public numbers or aliases that can be sent as
`scope.from`.

Replay up to 100 failed deliveries. Omit `sync_id` to replay the oldest failed deliveries for the hook:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "sync_id": "SYNC_ID", "limit": 100 }'
```

Replay never creates a new logical event. It resets the delivery attempts and keeps the original idempotency key.

## Filters

Providers:

- `whatsapp`
- `messenger`
- `instagram`
- `telegram`
- `gmail`
- `outlook`
- `imap_smtp`
- `mercadolibre`
- `google_business_profile`
- `*`

Common event filters:

| Filter | Receives |
| --- | --- |
| `*` | Every event in the selected provider and scope. |
| `message.*` | Live incoming messages/reactions. It does not include WhatsApp Business App echoes or History imports. |
| `message.text`, `message.image`, `message.audio`, `message.video` | One concrete live message type. |
| `message.document` | WhatsApp document events. |
| `message.reaction` | WhatsApp, Messenger, or Instagram reactions when the provider emits them. |
| `message.edit` | WhatsApp, Messenger, or Instagram edits when the provider emits them. |
| `message.button`, `message.interactive` | WhatsApp template-button, quick-reply, list, and Flow interactions. |
| `message.quick_reply` | Reply-button selections normalized across WhatsApp, Messenger, Instagram, and Telegram. |
| `message.file` | Messenger/Instagram file events. |
| `status.*` | WhatsApp delivery, read, and failure statuses. |
| `status.failed` | Only failed WhatsApp message statuses. |
| `scheduled.*` | Scheduled message creation, successful provider acceptance, terminal execution failure, and cancellation. |
| `template.*` | WhatsApp template updates. |
| `flow.submission.*` | WhatsApp Flow responses. |
| `smb_message_echo.*` | Messages/reactions sent from the WhatsApp Business App in coexistence. |
| `smb_app_state_sync.*` | Coexistence contact/app updates. |
| `user_preferences.*` | WhatsApp marketing preference changes. |
| `history.*` | Coexistence history synchronization. |
| `account_update.*` | WhatsApp account connection updates. |
| `onboarding.*` | Hosted onboarding lifecycle. |
| `consent.updated` | A contact's service or marketing consent state changed. |
| `contact.updated` | Easyhook-local WhatsApp contact metadata changed through the public API. |
| `review.created` | A new Google Business Profile review. |
| `review.updated` | A Google Business Profile review or business reply changed. |

Email providers use the same `message.*` subscription as the other channels.
Their normalized `message` block adds `subject`, optional `html`, `thread_id`,
`message_id_header`, `in_reply_to`, and `references`. Use `message.id` as
`reply_to_message_id` when replying through `POST /v1/messages/email`. Render
`html` as untrusted content and use the thread/header values when needed.

Filtering uses the provider event name. The delivered public `type` remains
standardized. Use `smb_message_echo.*` for messages sent from the WhatsApp
Business App. Use `message.*` for inbound messages only. Use `history.*`
separately for imported conversations. These families never overlap.

## Event Types

| Public `type` | Main block |
| --- | --- |
| `message.received` | `message` |
| `message.echo` | `message` |
| `message.media_available` | `message`; update the existing message with the same `message.id` |
| `message.edit` / normalized `message.received` | `message.edit.original_message_id`; update the original message instead of inserting another one |
| `message.revoke` / normalized `message.received` | `message.revoke.original_message_id`; mark the original message as deleted |
| `message.system` / normalized `message.received` | `message.system`; informational WhatsApp event such as a changed phone number |
| `message.sent` | `status` |
| `message.delivered` | `status` |
| `message.read` | `status` |
| `message.failed` | `status` |
| `message.status_updated` | `status` for a future/unknown provider status |
| `scheduled.created` | `scheduled_message` |
| `scheduled.sent` | `scheduled_message`; Easyhook received a WAMID from Meta |
| `scheduled.failed` | `scheduled_message`; terminal execution failure |
| `scheduled.cancelled` | `scheduled_message` |
| `flow.submitted` | `flow` |
| `template.status_changed` | `template` |
| `template.quality_changed` | `template` |
| `template.category_changed` | `template` |
| `template.components_changed` | `template` |
| `account.updated` | `account_update` |
| `contact.updated` | `contact_update` |
| `user.preference_updated` | `user_preference` |
| `consent.updated` | `consent` |
| `review.created` | `review` |
| `review.updated` | `review` |
| `onboarding.created` | `onboarding` |
| `onboarding.completed` | `onboarding` |
| `sync.failed` | `sync` for lifecycle failures, or `error` for a terminal item/provider error |
| `sync.started` | `sync` |
| `sync.progress` | `sync` |
| `sync.completed` | `sync` |
| `event.received` | Provider-dependent fallback; ignore safely if unsupported |

Unknown future provider events are delivered as `event.received`. Consumers
must ignore unknown top-level blocks and unknown enum values rather than
rejecting the whole request.

## Complete JSON Contract

Every non-batch delivery has this logical shape. Optional blocks and optional
fields are omitted; they are not sent as `null`.

```json
{
  "id": "easyhook_event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {},
  "contact": {},
  "message": {},
  "status": {},
  "template": {},
  "flow": {},
  "onboarding": {},
  "scheduled_message": {},
  "sync": {},
  "account_update": {},
  "contact_update": {},
  "error": {}
}
```

Only `id`, `type`, and `channel` are common. The remaining blocks depend on
`type`.

### Scheduled message correlation

Subscribe to `scheduled.*` together with `status.*` when an application schedules messages.

`scheduled.created`, `scheduled.sent`, `scheduled.failed`, and `scheduled.cancelled` carry:

```json
{
  "id": "easyhook_event_uuid",
  "type": "scheduled.sent",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "accepted",
    "delivery_state": "accepted"
  }
}
```

Later Meta status events remain standard `message.sent`, `message.delivered`, `message.read`, or `message.failed`. Their `status` block includes the same correlation:

```json
{
  "type": "message.delivered",
  "status": {
    "message_id": "wamid.HBg...",
    "scheduled_message_id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "recipient_id": "5215551112222",
    "timestamp": "2026-07-03T00:30:03.000Z"
  }
}
```

Failed status events preserve Meta's `errors` array and add a normalized
`status.error` when Easyhook can identify the cause:

```json
{
  "type": "message.failed",
  "status": {
    "message_id": "wamid.HBg...",
    "recipient_id": "5215551112222",
    "errors": [{
      "code": 131053,
      "title": "Media upload error",
      "error_data": {
        "details": "Sticker with dimensions 406x379 has incorrect dimensions, expected dimension: 512x512"
      }
    }],
    "error": {
      "code": "invalid_sticker_dimensions",
      "message": "Sticker must be exactly 512x512 pixels. Received 406x379.",
      "provider_code": 131053,
      "retryable": false,
      "details": {
        "width": 406,
        "height": 379,
        "expected_width": 512,
        "expected_height": 512
      }
    }
  }
}
```

Use `status.error.code` for application logic and retain the raw `errors`
array for diagnostics. A `message.failed` event is terminal unless the
normalized error explicitly reports `retryable: true`.

Treat webhook delivery as at-least-once. Deduplicate lifecycle events by top-level `id`, message statuses by `status.message_id` plus public `type`, and reconcile with `GET /v1/scheduled-messages/{id}` after webhook downtime.

### `account`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | WhatsApp Phone Number ID, Facebook Page ID, or Instagram account ID. A WhatsApp event without a phone ID can fall back to WABA ID. |
| `phone` | string | WhatsApp business phone in international digits, when known. |
| `name` | string | Messenger Page or Instagram channel display name, when known. |

### `contact`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Routable remote provider ID. For WhatsApp this can be a phone or a Business-scoped User ID (BSUID); it is not guaranteed to contain only digits. |
| `phone` | string or null | WhatsApp phone in international digits while Meta supplies it. It can be absent for username-first conversations. |
| `user_id` | string or null | WhatsApp BSUID, such as `MX.1030980939667977`. Prefer it as the stable contact key when present. |
| `parent_user_id` | string or null | Optional parent BSUID, such as `MX.ENT.11815799212886844830`, when Meta has enabled linked-portfolio identity for the business. |
| `username` | string or null | Optional WhatsApp username without `@`. |
| `country_code` | string or null | Optional country code supplied by WhatsApp. |
| `name` | string | Provider-supplied contact/profile name, when available. |

### `message`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Provider message ID (`wamid`/`mid`). Primary idempotency key for a message. |
| `direction` | `in` or `out` | Message direction when Easyhook can determine it. |
| `source` | string | `history`, `whatsapp_business_app`, or another provider source when relevant. |
| `from` | string | Provider identifier of the sender. |
| `to` | string | Provider identifier of the recipient. |
| `type` | string | `text`, `button`, `edit`, `interactive`, `image`, `audio`, `video`, `document`, `file`, `sticker`, `reaction`, `unsupported`, or a future provider type. |
| `text` | string | Text body for text/edit messages and the visible title selected in button, quick-reply, and list interactions. |
| `subject` | string | Email subject for Gmail, Outlook, and IMAP/SMTP. |
| `html` | string | Original email HTML when present. Treat it as untrusted content. |
| `thread_id` | string | Provider email thread identifier. |
| `message_id_header` | string | RFC Message-ID header. |
| `in_reply_to` | string | RFC parent Message-ID. |
| `references` | string | RFC references chain. |
| `attachments` | array | Normalized email attachments, including protected Easyhook media IDs. |
| `media` | object | Normalized media metadata described below. |
| `reaction` | object | Target message and emoji. |
| `button` | object | WhatsApp template button response with `text` and provider `payload`. |
| `interactive` | object | WhatsApp interactive response with `type` and a `button_reply` or `list_reply` block. |
| `edit` | object | Original message ID, replacement type, and replacement text. |
| `referral` | object | Click-to-WhatsApp/provider referral context. |
| `unsupported` | object | Unsupported provider type and errors. |
| `timestamp` | ISO 8601 string | Original provider timestamp after normalization. |
| `history` | object | History thread/status/chunk metadata. |

`message.media` can contain:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Meta media ID when available. |
| `mime_type` | string | MIME type. |
| `url` | string | Easyhook-authenticated download URL or usable provider URL. |
| `caption` | string | Media caption. |
| `filename` | string | Original document/file name. |
| `sha256` | string | Provider/file digest when available. |
| `size` | number | Size in bytes. |
| `expires_at` | ISO 8601 string | URL/asset expiration when applicable. |

`message.reply_to.message_id` identifies the original message for an inline
reply. `message.reaction` contains `message_id`, `action`, and optional `emoji`
or provider reaction name. `action: "unreact"` removes the previous reaction.
`message.edit` contains `original_message_id`, `type`, `text`, and optional
`num_edit`; update the original message instead of inserting a second message.
`message.unsupported` contains `type` and optional
`errors[]`. `message.history` can contain `thread_id`, `status`, `phase`,
`chunk_order`, and `progress`.

For WhatsApp button responses, never infer the selected action from the
template definition. Easyhook preserves the values supplied by Meta:

```json
{
  "message": {
    "type": "button",
    "text": "Confirmar asistencia",
    "button": {
      "text": "Confirmar asistencia",
      "payload": "confirm_attendance"
    }
  }
}
```

Interactive quick replies and list selections use the same visible
`message.text` convenience field and retain their structured identifier:

```json
{
  "message": {
    "type": "interactive",
    "text": "Necesito cambiarla",
    "interactive": {
      "type": "button_reply",
      "button_reply": {
        "id": "change_attendance",
        "title": "Necesito cambiarla"
      }
    }
  }
}
```

For new multichannel automation, prefer `message.quick_reply.payload`.
Easyhook also preserves the provider-specific WhatsApp fields
`message.button.payload`, `message.interactive.button_reply.id`, and
`message.interactive.list_reply.id` for compatibility. Use `message.text` only
as the human label. If a provider omits an identifier, Easyhook leaves it
absent rather than guessing it.

### Multichannel quick replies

Reply buttons selected in WhatsApp, Messenger, Instagram, or Telegram use the
event filter `message.quick_reply`. The public event is normalized as:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841401731804358" },
  "contact": { "id": "27481212444850810" },
  "message": {
    "id": "mid...",
    "direction": "in",
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Use `message.quick_reply.payload` as the stable routing value. A subscription
to `message.*` also receives this event; do not subscribe to both filters on
separate automations unless duplicate processing is intentional.

### Cross-channel replies, reactions, and edits

Easyhook uses the same normalized fields when WhatsApp, Messenger, or Instagram
provides the underlying event:

- Inline reply: `message.reply_to.message_id`.
- Reaction: `message.reaction.message_id`, `action`, and optional `emoji`.
- Edit: `message.edit.original_message_id`, `text`, and optional `num_edit`.

Provider capabilities are not identical. Meta currently exposes Messenger and
Instagram reactions and edits, and Instagram inline reply references. Meta does
not expose Messenger or Instagram message deletion/unsend as an equivalent
webhook, so Easyhook does not infer or fabricate those events. Always ignore
unknown optional fields and only process events that were actually delivered.

### WhatsApp deletions and system notices

Subscribe to the provider event names `message.revoke` and `message.system`.
These are normalized message events, so the delivered
top-level `type` is `message.received`; route the operation with
`message.type`:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "109489555192993", "phone": "5218441010369" },
  "contact": { "id": "5218445625711" },
  "message": {
    "id": "wamid.edit-event",
    "type": "edit",
    "text": "Texto corregido",
    "edit": {
      "original_message_id": "wamid.original",
      "type": "text",
      "text": "Texto corregido"
    },
    "timestamp": "2026-07-31T13:33:03.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.revoke-event",
    "type": "revoke",
    "revoke": { "original_message_id": "wamid.original" },
    "timestamp": "2026-07-31T11:28:57.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.system-event",
    "type": "system",
    "system": {
      "type": "user_changed_number",
      "body": "User A changed from 5218447301597 to 5218446730750",
      "wa_id": "5218446730750"
    },
    "timestamp": "2026-07-30T02:34:03.000Z"
  }
}
```

Consumer rules:

- For `edit`, find the existing row by `message.edit.original_message_id`,
  replace its text with `message.edit.text` (or `message.text`), and mark it as
  edited. Do not insert a second chat message.
- For `revoke`, find the existing row by
  `message.revoke.original_message_id`, mark it as revoked, and hide or clear
  its content. Do not insert a standalone chat message.
- For `system`, display `message.system.body` as an informational notice. For
  `user_changed_number`, use `message.system.wa_id` as the new WhatsApp
  identity according to the application's contact-merging policy.
- Deduplicate each webhook with top-level `id`. Use the original WAMID for the
  message update; the event's `message.id` identifies the edit, revoke, or
  system event itself.
- Never render these events as a generic empty message when their specialized
  block is present.

### `status`

| Field | Type | Meaning |
| --- | --- | --- |
| `message_id` | string | Provider message ID whose status changed. |
| `recipient_id` | string | Recipient phone number, when Meta supplies it. |
| `recipient_user_id` | string | Recipient BSUID. Meta includes it for WhatsApp status events. |
| `parent_recipient_user_id` | string | Optional parent BSUID for eligible linked portfolios. |
| `timestamp` | ISO 8601 string | Provider status time. |
| `conversation` | object | Meta conversation/pricing-window metadata. |
| `pricing` | object | Meta pricing fields, passed through as a compact object. |
| `errors` | array | Meta failure objects when supplied. |

`status.conversation` can contain `id`, `expires_at`, `origin`, and
`free_entry_point`. A failed delivery should be handled from `status.errors`
without assuming a fixed provider error schema.

### `template`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Meta template ID. |
| `name` | string | Template name. |
| `language` | string | Template language code. |
| `status` | string | Meta update event/status. |
| `quality` | string | New quality value. |
| `category` | string | New category value. |
| `reason` | string | Meta reason code/text. |
| `description` | string | Provider description. |

### `flow`

| Field | Type | Meaning |
| --- | --- | --- |
| `submission_id` | string | Stable Easyhook/provider submission identity. |
| `id` | string | Meta Flow ID. |
| `name` | string | Flow name. |
| `token` | string | Application correlation token supplied when sending the Flow. |
| `action` | string | Flow action, commonly `complete`. |
| `screen` | string | Last/submitted screen ID. |
| `data` | object | Submitted Flow fields. Treat keys as Flow-defined dynamic data. |

### `onboarding`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Hosted onboarding session ID. |
| `status` | string | Session status. |
| `url` | string | Hosted onboarding URL, when applicable. |
| `expires_at` | ISO 8601 string | Session expiration. |
| `organization` | object | Owning Easyhook organization display data: `name`, `slug`, and optional public `logo_url`. |
| `signup_mode` | string | `cloud_api` or `coexistence`. |
| `customer_name`, `customer_email` | string | Optional caller references. |
| `return_url` | string | Caller return URL. |
| `metadata` | object | Caller-supplied correlation metadata. |
| `waba`, `phone` | object | Connected Meta asset details after completion. |

### `sync`

Lifecycle events can contain `id`, `status`, `media_mode`, `progress`,
`history_events`, `state_events`, `media_pending`, `media_completed`, `phase`,
`chunk_order`, `error`, and `updated_at`.

### Update and error blocks

- `account_update`: `event`, `phone_number`, and provider `details`.
- `contact_update`: `type`, `action`, `provider_id`, `user_id`, `name`, and
  `timestamp`.
- `error`: `code`, `title`, `message`, and optionally
  `provider_message_id`.

Do not require every documented optional field. Meta omits fields depending on
channel, message type, account permissions, and event generation path.

## Coexistence History

WhatsApp Business App coexistence history is normalized into the same public message events used for live traffic:

- Messages received from a contact use `type: message.received` and `message.direction: in`.
- Messages previously sent by the business use `type: message.echo` and `message.direction: out`.
- Both include `message.source: history` so consumers can distinguish synchronized history from live events.
- Both include `message.from` and `message.to` so consumers can route inbound and outbound history without inferring participants from direction.
- `message.history` may include `thread_id`, `status`, `phase`, `chunk_order`, and `progress` when Meta supplies them.

History payloads are acknowledged and persisted before asynchronous processing. Easyhook processes and delivers at most 100 events per batch. Duplicate Meta message IDs do not create duplicate stored messages.

Initial History and App State synchronization is included at no additional charge. Only one synchronization can run per WhatsApp number at a time. An organization can process up to two of its numbers concurrently; this is a fairness limit, not a limit on connected numbers or total imports. Subscribe to `history.*` and `smb_app_state_sync.*` before connecting or requesting synchronization, keep the endpoint available, and expect large accounts to continue importing in the background after Meta finishes onboarding.

Meta documents History as an import of up to approximately 180 days and excludes group conversations. It is not the phone's complete iCloud/Google Drive backup. See Meta's official [History webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history) and [SMB App State Sync reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

Historical imports never trigger live consent keyword handling or replay Flow submission side effects. They only rebuild message history and emit the subscribed `history.*` customer webhook events.

Subscribe to `history.*` before connecting or requesting coexistence synchronization when the destination must receive the complete historical import. Live inbound events use `message.*`; live WhatsApp Business App echoes use `smb_message_echo.*`.

The subscription selector uses the provider event (`history.*`). Easyhook sends `{ "type": "sync.batch", "sync": {...}, "events": [...] }`, with at most 100 normalized events in `events`. Each event keeps the standard public `type` (`message.received` or `message.echo`). Neither `message.*` nor `smb_message_echo.*` receives the historical import.

Complete batch envelope:

```json
{
  "id": "sync_batch_abc123",
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync_session_uuid",
    "source": "history",
    "phase": 1,
    "chunk_order": 2,
    "progress": 80,
    "cursor": 300,
    "count": 100,
    "total": 1200
  },
  "events": [
    {
      "id": "event_uuid",
      "type": "message.received",
      "channel": "whatsapp",
      "account": { "id": "980912725115744", "phone": "5218661479075" },
      "contact": { "id": "5214445087305" },
      "message": {
        "id": "wamid...",
        "direction": "in",
        "source": "history",
        "from": "5214445087305",
        "to": "5218661479075",
        "type": "text",
        "text": "Previous message",
        "timestamp": "2026-07-01T10:00:00.000Z"
      }
    }
  ]
}
```

The outer batch uses `provider` for backward compatibility while every
normalized inner event uses `channel`. Replay batches additionally contain
`sync.replay: true`; their `sync.id` is the replay ID and `phase`,
`chunk_order`, or `progress` can be absent.

The same `history.*` subscription receives lifecycle objects separately from batches:

```json
{
  "id": "event_uuid",
  "type": "sync.progress",
  "channel": "whatsapp",
  "sync": {
    "id": "sync_uuid",
    "status": "progress",
    "media_mode": "recent_media",
    "progress": 100,
    "history_events": 1200,
    "state_events": 430,
    "media_pending": 8,
    "media_completed": 12
  }
}
```

`sync.progress.progress` is Meta's reported ingestion progress. `history_events` and `state_events` are Easyhook's processed counters. Completion is explicit through `sync.completed`; do not infer it only from `progress: 100`.

The business must allow history sharing in the WhatsApp Business App during coexistence onboarding and should keep the app open while the initial sync starts. If history sharing is disabled, Meta can return error `2593109`; Easyhook delivers it to the same `history.*` subscription as `type: sync.failed`.

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": { "id": "5214445087305" },
  "message": {
    "id": "wamid...",
    "direction": "out",
    "source": "history",
    "from": "5218661479075",
    "to": "5214445087305",
    "type": "text",
    "text": "Previous reply",
    "history": {
      "thread_id": "5214445087305",
      "status": "READ",
      "phase": 1,
      "chunk_order": 2,
      "progress": 80
    }
  }
}
```

### Consumer mapping rules

Treat each element of `events` as one normalized message. The outer object is an Easyhook delivery batch, not Meta's raw `messages[]`, `contacts[]`, or `history[]` payload.

- Use `account.id + ":" + (contact.user_id ?? contact.id)` as the conversation key. The account ID is required because a BSUID is scoped to the business and the same person can talk to more than one connected number.
- Use `message.id` (the Meta `wamid`) as the message deduplication key. Webhook and workflow processing must be idempotent.
- Sort imported messages by `message.timestamp`, not by webhook arrival time. Separate conversations can be processed concurrently, so global delivery order is not meaningful.
- For `message.direction: in`, `contact` is the sender and `account` is the receiving Easyhook number.
- For `message.direction: out`, `account` is the sender and `contact` is the recipient.
- WhatsApp usernames can hide the person's phone number. Meta then identifies the contact with a Business-scoped User ID (BSUID), such as `MX.1030980939667977`. Easyhook stores phone/BSUID aliases when Meta supplies both and preserves the BSUID in `contact.user_id`; eligible linked portfolios also receive `contact.parent_user_id`. `contact.phone` and status `recipient_id` can be absent, while normalized `message.from`/`message.to` remain routable with the phone or BSUID. Never require digits, invent a phone, or strip letters and punctuation from these identifiers.
- During Meta's transition window a webhook can contain both `contact.phone` and `contact.user_id`; store both. A later webhook can contain only the BSUID and still belongs to the same contact.
- In rare historical records, Meta can omit every remote-contact field. Easyhook emits `type: sync.failed` with `error.code: missing_remote_contact` and `error.provider_message_id` instead of publishing an unusable `message.received` or `message.echo`. Keep the rest of the import and record this item as terminal unless Meta later supplies the missing identity.
- Do not trigger live auto-replies, consent keyword detection, or other real-time inbound automations when `message.source === "history"` unless replay behavior is explicitly intended.
- A history subscription can receive `sync.failed`; handle it separately from message events and keep the workflow retry-safe.
- Delivery is at-least-once. Easyhook retries failed batches up to five times with backoff; always deduplicate by `message.id`.
- Easyhook processes one synchronization per WhatsApp number and up to two numbers concurrently per organization. Additional numbers remain queued and resume automatically; time spent waiting for capacity does not consume delivery or synchronization failure attempts.
- Historical media is imported independently. A message can first arrive with
  media metadata or a placeholder and later arrive as
  `message.media_available` with the same `message.id` and a download URL. Do
  not delay the conversation import while waiting for media or treat the
  availability event as a new customer message.
- Easyhook honors a valid destination `Retry-After` value, then uses `30s`, `2m`, `10m`, `1h`, and `6h` retry windows. After five failed attempts, the delivery remains in the logical dead-letter queue until replayed.

### Replaying stored history

Retrying failed HTTP deliveries and replaying the stored import are separate operations:

```bash
# Retry failed batches that already exist in the outbox.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"sync_id":"SYNC_ID","limit":100}'

# Re-read stored messages and send them to this active history webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"history"}'

# Re-read stored contacts and send them to an active smb_app_state_sync webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"contacts"}'
```

The second response contains `replay.id`. Check progress with:

```bash
curl https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays/REPLAY_ID \
  -H "Authorization: Bearer eh_live_xxx"
```

Replay batches use the same `sync.batch` contract and add `sync.replay: true`. Message replays set `sync.source: history`; contact replays set `sync.source: smb_app_state_sync`. Messages preserve `message.id`, while contacts preserve their normalized event identity. Only one active replay of each type is allowed for the same webhook and number.

### Historical media policy

Choose the policy when requesting a synchronization:

| `media_mode` | Behavior |
| --- | --- |
| `metadata` | Imports message and media metadata without downloading files. |
| `recent_media` | Downloads available recent images, audio, documents, and stickers; skips video. This is the default. |
| `all_recent_media` | Also downloads available recent video. |

Meta generally exposes downloadable media IDs only for recent historical media (approximately the last 14 days). Older messages can remain as metadata or `media_placeholder`; missing media never fails the message import. Storage and transfer use the normal Easyhook media quotas.

When Meta sends `media_placeholder` without a media ID, Easyhook emits `message.media.storage_status: "unavailable"` and `placeholder: true`. No file exists to download in that case. Consumers must show a placeholder and wait for `message.media_available`; they must not treat it as an empty text message.

For `edit`, update the existing row identified by
`message.edit.original_message_id`. For `revoke`, use
`message.revoke.original_message_id` to mark the existing message as deleted.
For `system`, display `message.system.body` as an informational notice and do
not treat it as a new customer message or open a service window. The same
mapping rules apply when these records arrive inside a History batch.

## Coexistence App State Sync

The `smb_app_state_sync.*` filter receives contact and app-state records imported from the WhatsApp Business App. Easyhook emits one normalized event per record:

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": {
    "id": "980912725115744",
    "phone": "5218661479075"
  },
  "contact": {
    "id": "5214445087305",
    "user_id": "MX.1030980939667977",
    "parent_user_id": "MX.ENT.11815799212886844830",
    "name": "Customer"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "5214445087305",
    "user_id": "MX.1030980939667977",
    "parent_user_id": "MX.ENT.11815799212886844830",
    "name": "Customer",
    "timestamp": "2026-07-18T15:20:00.000Z"
  }
}
```

`contact_update.type` and `contact_update.action` preserve Meta's record classification. Consumers must not hardcode a closed list of values. Retain `contact_update.provider_id`, `contact_update.user_id`, and optional `contact_update.parent_user_id`, and process repeated updates idempotently. BSUIDs are opaque and must not be reformatted as phone numbers.

## WhatsApp User Preferences

Subscribe to `user_preferences.*` to receive Meta marketing-preference changes as `user.preference_updated`. The normalized `contact` retains phone, BSUID, parent BSUID, and username when supplied; `user_preference` contains `category`, `detail`, `value`, and `timestamp`. Phone fields may be absent for username-enabled users.

See Meta's [Business-scoped User IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids) documentation and [WhatsApp username announcement](https://about.fb.com/news/2026/06/its-time-to-reserve-your-whatsapp-username/) for the provider transition.

Subscribe to both `smb_app_state_sync.*` and `history.*` before starting coexistence synchronization when the destination needs both the imported contact state and historical conversations. State-sync events do not contain historical messages; history events do not replace contact-state updates.

## Local Contact Metadata Updated

Subscribe to `contact.updated` to receive changes made through `PUT /v1/contacts`. These events describe Easyhook-local metadata and are separate from provider-originated `smb_app_state_sync.*` events.

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": {
    "id": "5214445087305",
    "phone": "5214445087305",
    "name": "Ana",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "5214445087305",
    "name": "Ana Garcia",
    "preferred_name": "Ana",
    "source": "easyhook_api",
    "write_target": "easyhook",
    "provider_contact_book_updated": false,
    "timestamp": "2026-08-12T18:30:00.000Z"
  }
}
```

This event does **not** mean the WhatsApp Business App address book changed. Meta currently exposes contact/app-state synchronization toward providers, but no Cloud API operation to write a contact name back into that address book.

## Consent Updated

Subscribe to `consent.updated` to react to opt-in, opt-out, and pending opt-out
changes without polling the status endpoint. Easyhook emits the event only when
the stored state changes. Evidence remains in the organization's audit record
and is never included in the customer webhook.

```json
{
  "id": "event_uuid",
  "type": "consent.updated",
  "channel": "whatsapp",
  "account": { "id": "980912725115744" },
  "contact": { "id": "5218661479075" },
  "consent": {
    "contact": "5218661479075",
    "scope": "marketing",
    "status": "opt_out",
    "previous_status": "opt_in",
    "source": "whatsapp_flow",
    "updated_at": "2026-07-31T18:00:00.000Z"
  }
}
```

Use the top-level `id` as the idempotency key. `scope` is `service` or
`marketing`; `status` is `opt_in`, `opt_out`, or `pending_opt_out`. Query the
complete current state with `GET /v1/consent/status` when reconciling a CRM.
`pending_opt_out` only reports that Easyhook sent a confirmation Flow. It does
not revoke an existing opt-in. The pending request expires after one hour if
the contact does not submit the Flow.

## Media Message

Media fields are normalized across channels. `url` is included when Easyhook stored the media or Meta supplied a usable URL.

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": { "id": "5214445087305", "name": "Customer" },
  "message": {
    "id": "wamid...",
    "type": "image",
    "media": {
      "id": "META_MEDIA_ID",
      "mime_type": "image/jpeg",
      "url": "https://api.easyhook.dev/v1/media/asset_uuid/download",
      "caption": "Photo",
      "size": 48231,
      "expires_at": "2027-01-11T00:00:00.000Z"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

The URL may contain an internal asset UUID because it is an opaque download resource. No separate asset UUID is exposed in the JSON.

WhatsApp circular video notes currently arrive from Meta as unsupported messages without a media ID or URL:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "unsupported",
    "unsupported": {
      "type": "video_note",
      "errors": [{ "code": 131051, "message": "Message type unknown" }]
    }
  }
}
```

## Reactions

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": { "id": "5214445087305" },
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.target",
      "emoji": "❤️"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

An empty `emoji` removes the previous reaction. Reactions sent from the connected WhatsApp Business App use public type `message.echo`.

## Delivery Status

```json
{
  "id": "event_uuid",
  "type": "message.delivered",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": { "id": "5214445087305" },
  "status": {
    "message_id": "wamid...",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

Failed statuses include `errors` only when Meta supplies them.

### Click-to-WhatsApp and the 72-hour Free Entry Point

An inbound message that originated from an eligible Click-to-WhatsApp entry point can include Meta's referral context:

```json
{
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "text",
    "text": "Quiero informacion",
    "referral": {
      "source_type": "ad",
      "source_id": "ad_123",
      "source_url": "https://fb.me/...",
      "headline": "Oferta",
      "ctwa_clid": "clid_123"
    }
  }
}
```

The referral object identifies the entry point but does not by itself prove that the 72-hour window opened. Meta confirms the active free-entry-point conversation in an outbound status event:

```json
{
  "type": "message.sent",
  "channel": "whatsapp",
  "status": {
    "message_id": "wamid...",
    "conversation": {
      "id": "conversation_123",
      "expires_at": "2026-07-13T10:01:00.000Z",
      "origin": "referral_conversion",
      "free_entry_point": true
    },
    "pricing": {
      "billable": false,
      "model": "PMP",
      "category": "referral_conversion"
    }
  }
}
```

The 72-hour window describes Meta pricing. Free-form messages still require the separate 24-hour customer service window.

With current per-message pricing, Meta can omit the legacy `conversation` block and instead return `pricing.model = PMP` with `pricing.type = free_entry_point`. Easyhook recognizes both formats.

## Flow Submission

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": { "id": "980912725115744", "phone": "5218661479075" },
  "contact": { "id": "5214445087305" },
  "flow": {
    "submission_id": "submission_uuid",
    "id": "META_FLOW_ID",
    "name": "lead_capture",
    "token": "customer_123",
    "action": "complete",
    "screen": "LEAD",
    "data": {
      "name": "Benjamin",
      "service_opt_in": true
    }
  }
}
```

Consent fields in a submitted Flow continue to update Easyhook's consent state before delivery.

## Hosted Onboarding

Subscribe to `onboarding.*` to receive hosted signup lifecycle events:

```json
{
  "id": "event_uuid",
  "type": "onboarding.completed",
  "channel": "whatsapp",
  "onboarding": {
    "id": "session_uuid",
    "status": "completed",
    "signup_mode": "coexistence",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" },
    "connection": {
      "channel_id": "channel_uuid",
      "account_id": "980912725115744",
      "display_name": "Support",
      "provider": "whatsapp"
    },
    "waba": { "id": "909330258580490", "name": "Business" },
    "phone": {
      "id": "980912725115744",
      "display_phone": "+52 1 866 147 9075",
      "quality": "GREEN"
    }
  }
}
```

`onboarding.completed` is written to the same persistent outbox used by other
customer webhook events. Use the normal Easyhook delivery id/idempotency
contract: retries do not represent a second channel connection.

## Google Business Profile Reviews

Choose provider `google_business_profile` and subscribe to `review.created`,
`review.updated`, or `review.*`. Scope `channel` limits delivery to one connected
location; organization scope receives every selected location.

```json
{
  "id": "event-id",
  "type": "review.created",
  "channel": "google_business_profile",
  "account": {
    "id": "accounts/123/locations/456",
    "name": "Sucursal Centro"
  },
  "review": {
    "id": "review_abc",
    "name": "accounts/123/locations/456/reviews/review_abc",
    "rating": 5,
    "comment": "Excelente atención",
    "reviewer": {
      "name": "Ana",
      "photo_url": "https://example.com/photo.jpg",
      "is_anonymous": false
    },
    "created_at": "2026-08-04T18:10:00Z",
    "updated_at": "2026-08-04T18:10:00Z",
    "reply": null
  }
}
```

Google Pub/Sub sends only a change notification. Easyhook fetches the current
review, normalizes it, deduplicates by review and update time, and then delivers
the customer webhook. Delivery remains at-least-once: deduplicate non-message
events by top-level `id`. A changed review or business reply can produce
`review.updated` with the same `review.id` and a newer `updated_at`.

## Headers And Security

Every delivery includes:

```http
Content-Type: application/json
User-Agent: Easyhook-Webhooks/1.0
X-Easyhook-Delivery: <delivery_uuid>
X-Easyhook-Event: <public_type>
X-Easyhook-Provider-Event: <filter/debug_event>
X-Easyhook-Timestamp: <unix_seconds>
```

Authentication modes:

| Mode | Header |
| --- | --- |
| `hmac` | `X-Easyhook-Signature: sha256=<hex>` |
| `bearer` | `Authorization: Bearer <secret>` |
| `custom_header` | Configured header and generated secret |
| `none` | No authentication; tests only |

HMAC calculation:

```text
hex_hmac_sha256(secret, raw_request_body)
```

The secret is returned only when the subscription is created.

## Facebook And Instagram Comments

Subscribe to `comment.*` or one of `comment.created`, `comment.updated`, and
`comment.deleted`. Instagram currently emits `comment.created` for `comments`
and `live_comments`; Facebook Page `feed` also identifies edits and removals.

```json
{
  "id": "event-id",
  "type": "comment.created",
  "channel": "instagram_comments",
  "account": {
    "id": "17841400000000000",
    "name": "Easyhook"
  },
  "comment": {
    "id": "18000000000000001",
    "text": "Me interesa",
    "action": "created",
    "parent_id": null,
    "root_id": "18000000000000001",
    "author": {
      "id": "17841400000000002",
      "username": "cliente"
    },
    "post": {
      "id": "18000000000000000",
      "type": "media"
    }
  }
}
```

Use top-level `id` for delivery idempotency and `comment.id` as the stable
provider comment ID. A comment is public content, not a DM: do not route it
through message auto-reply logic. Reply with
`POST /v1/comments/{comment.id}/reply`. `comment.post.type` is `post`, `media`,
or `live`. Use `comment.root_id` as the stable thread key: the root comment and
all of its nested replies share that value. `comment.parent_id` identifies the
immediate parent when Meta supplies one; do not use the post ID as a thread key.
The payload shape is identical for Facebook and Instagram comments. Only
`channel` (`facebook_comments` or `instagram_comments`) and the provider-native
post/media values differ, so one consumer can handle both without treating
either as a private Messenger or Instagram conversation.

These events are live change notifications, not a historical import. Meta does
not replay comments that existed before the account installed the webhook
subscription. Deduplicate repeated deliveries by top-level `id`; do not infer
that a missing historical comment was deleted.

## Channel health

Subscribe to `channel.health_changed` to learn when a connected WhatsApp,
Messenger, Instagram, email, or other supported sender changes health state.
The event is emitted only on a state transition:

```json
{
  "id": "event_uuid",
  "type": "channel.health_changed",
  "channel": "messenger",
  "account": { "id": "852736564589134", "name": "Easyhook" },
  "channel_health": {
    "status": "reauthorization_required",
    "previous_status": "connected",
    "action_required": true,
    "checked_at": "2026-08-22T09:19:07.211Z",
    "code": "meta_asset_unavailable",
    "message": "Provider asset is unavailable to the current credential"
  }
}
```

Treat `unreachable` as potentially temporary and `reauthorization_required` as
an explicit reconnect prompt. Consumers can reconcile current state at any time
with `GET /v1/senders` or `GET /v1/senders/{account_id}/health`.

## n8n

Install:

```text
n8n-nodes-easyhook
```

Add **Easyhook Trigger**, select the Easyhook credential and provider, then choose from the compatible events and connected scope accounts loaded by Easyhook. Activate the workflow to register its Production URL and HMAC secret automatically. Deactivation deletes the subscription.

For coexistence history:

1. Choose `Provider: WhatsApp`.
2. Choose `Event: Coexistence history (history.*)`.
3. Select `Organization`, `WABA`, or `WhatsApp number` and the corresponding account when required.
4. Activate the workflow before connecting the phone or pressing coexistence sync in Easyhook.
5. In the WhatsApp Business App onboarding, allow history sharing and keep the app open while synchronization starts.

Each Easyhook batch starts one n8n execution and expands into at most 100 output items. Inspect `message.direction` to distinguish inbound (`in`) from outbound (`out`), use `message.source === "history"` to distinguish imported messages from live traffic, and inspect the `sync` metadata copied onto each trigger item for session, cursor, replay, and progress. Easyhook creates and signs the n8n subscription automatically; no second webhook in the portal is required.

If a workflow was inactive or its old mapping rejected part of an import, activate the corrected workflow and use **Reenviar historial** on the corresponding Easyhook in the portal. This reuses the stored import; it does not reconnect the phone or request another Meta export.

If Meta cannot start the import, the trigger can instead receive:

```json
{
  "type": "sync.failed",
  "channel": "whatsapp",
  "error": {
    "code": "2593109",
    "message": "History sync is turned off by the business from the WhatsApp Business App"
  }
}
```

The trigger obtains these choices from `GET /v1/webhooks/options`. The endpoint is restricted to the tenant of the API key and returns display labels and public aliases, never provider tokens or internal tenant IDs.

## Billing And Delivery

- Meta ingestion and portal updates are not billed.
- Incoming messages and every delivery to a subscribed endpoint are free.
- Wallet balance never blocks customer webhook delivery.
- Attempts are recorded for auditability.
- Deliveries use a persistent outbox and retry failed requests up to five times with backoff. Easyhook honors a valid `Retry-After` response and supports controlled replay through `POST /v1/webhooks/{id}/replay`.

Inbound media is retained for up to six months. Each organization includes `10 GB/month` transfer and `100 GB` active received-media storage; documented overages apply beyond those quotas.

## Internal Meta Endpoints

Customers do not call these endpoints:

```http
GET  /v1/meta/whatsapp/webhook
POST /v1/meta/whatsapp/webhook
GET  /v1/meta/messaging/webhook
POST /v1/meta/messaging/webhook
```

Easyhook verifies Meta signatures, stores each event, updates the portal, then delivers only matching customer subscriptions.
