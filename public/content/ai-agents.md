# Easyhook Agent Integration Guide

Last updated: 2026-08-10

This file is the entry point for a coding agent integrating Easyhook into
another application. It is intentionally concise. The normative contracts are:

1. [Public API](./public-api.md): every customer endpoint, request parameter,
   response, error, billing rule, and example.
2. [Customer Webhooks](./customer-webhooks.md): subscription API, filters,
   security headers, normalized JSON field names, History batches, and retries.

Do not invent fields from provider documentation or use old Easyhook examples found
elsewhere. Easyhook accepts provider events internally but exposes its own compact,
normalized public contract.

## Integration Inputs

Obtain these from the Easyhook organization owner:

```text
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=provider-native account ID or connected WhatsApp number
EASYHOOK_WEBHOOK_URL=https://your-app.example/webhooks/easyhook
```

The API key fixes the organization. Never send `tenant_id` to a public
endpoint. `from` must resolve to a connected channel owned by that
organization. Prefer the provider-native `account.id` received in Easyhook
webhooks. WhatsApp also accepts its connected international number; do not add
`page_` or `ig_` prefixes.

For WhatsApp, always include the international country calling code. Easyhook
accepts E.164, digits-only international values, spaces, hyphens, parentheses,
dots, and the `00` international prefix. It does not infer a country from a
national-only number. Mexican `52`/`521` variants and Argentine mobile
`54`/`549` notation are normalized automatically.

## Minimal Send

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: customer-123-message-456" \
  -d '{
    "from": "5218661479075",
    "to": "5215660069997",
    "body": "Hola"
  }'
```

Use a stable `Idempotency-Key` for every write that the application can retry.
Do not reuse the same key for two different logical operations.

For a scheduled message, also send an application-owned `client_reference`:

```json
{
  "from": "5218661479075",
  "to": "5215660069997",
  "body": "Recordatorio",
  "at": "2026-07-25T10:00:00-06:00",
  "client_reference": "appointment-reminder-456"
}
```

Persist the returned `scheduled_message.id`. Subscribe to both `scheduled.*`
and `status.*`. `scheduled.sent` provides the provider message ID; later message status
events include `scheduled_message_id` and `client_reference`. Reconcile after a
timeout or webhook outage with:

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Never correlate a scheduled message by recipient, template name, or timestamp.
`client_reference` accepts at most 200 characters. Treat the HTTP response as
the scheduling acknowledgment: a locally generated reference without a returned
`scheduled_message.id` does not prove Easyhook received the request.

## Minimal Webhook Setup

Discover valid options first:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

Create the subscription:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production app",
    "url": "https://your-app.example/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*", "scheduled.*"],
    "auth_type": "hmac",
    "scope": {
      "type": "phone",
      "from": "5218661479075"
    }
  }'
```

Store the returned `secret` immediately. Easyhook returns it only once.

Validate the exact raw HTTP body:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function validEasyhookSignature(
  rawBody: Buffer,
  received: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

Validate before parsing JSON. Respond with HTTP `2xx` quickly and process
asynchronously.

## Routing Rules

- Use `type` to choose the payload block.
- Use `channel` to distinguish `whatsapp`, `messenger`, `instagram`, `telegram`,
  `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, and
  `google_business_profile`.
- For WhatsApp, use `account.id + ":" + (contact.user_id ?? contact.id)` as the
  conversation identity. `contact.id`, `message.from`, `message.to`, and status
  recipients can be opaque BSUIDs rather than phone numbers. Preserve
  `contact.phone` separately when present and never strip letters or punctuation
  from a BSUID.
- Use `message.id` as the message idempotency key.
- For TikTok, preserve `account.id`, `contact.id`, conversation IDs, and
  `message.id` exactly. The business cannot initiate a conversation and may
  send at most 10 replies within 48 hours after each user message.
- Use webhook `id` as the idempotency key for non-message events.
- For `message.type: button`, route automation with `message.button.payload`
  and use `message.button.text`/`message.text` as the visible label.
- For `message.type: interactive`, route quick replies and lists with
  `message.interactive.button_reply.id` or
  `message.interactive.list_reply.id`; do not infer a selection from template
  button order or title.
- When `message.type` is `edit`, update the row identified by
  `message.edit.original_message_id` with `message.edit.text`; do not insert a
  second message.
- For WhatsApp, Messenger, and Instagram, use the same optional structures when
  present: `message.reply_to.message_id`, `message.reaction.message_id` plus
  `action`/`emoji`, and `message.edit.original_message_id` plus `text`.
  Capabilities differ by provider; never infer a missing reaction, edit, reply,
  or deletion from text or timing.
- When `message.type` is `revoke`, mark the row identified by
  `message.revoke.original_message_id` as revoked and hide its content; do not
  insert a standalone message.
- When `message.type` is `system`, show `message.system.body` as an
  informational notice. For `user_changed_number`, use `message.system.wa_id`
  as the new provider identity according to the application's contact-merging
  policy.
- `message.direction: in` means the contact sent the message.
- `message.direction: out` means the connected account sent the message.
- `message.source: history` is an import, not a live customer action. Never
  auto-reply to it by default.
- Unknown fields, unknown enum values, and `event.received` must be ignored
  safely.
- Optional blocks are omitted rather than sent as `null`.

## History And Contacts

Subscribe to both `history.*` and `smb_app_state_sync.*` before requesting a
coexistence synchronization.

History arrives as:

```json
{
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync-id",
    "source": "history",
    "count": 100,
    "total": 1000
  },
  "events": []
}
```

Loop over `events`. A batch contains at most 100 normalized events. Delivery is
at-least-once, so upsert messages by `message.id` and contacts by the provider
identity. Sort imported messages by `message.timestamp`, not arrival time.

`message.media_available` updates the existing message with the same
`message.id`; it is not a new conversation message. `sync.failed` does not
invalidate successfully imported events.

## API Selection

| Goal | Endpoint |
| --- | --- |
| Validate key | `GET /v1/me` |
| Send text | `POST /v1/messages/text` |
| Send standardized reply or URL buttons | `POST /v1/messages/interactive` |
| Send Messenger/Instagram quick replies | `POST /v1/messages/quick-replies` |
| Send multichannel text | `POST /v1/messages/send` |
| Send humanized multichannel text | `POST /v1/messages/humanized-text` (WhatsApp, Messenger, Instagram, Telegram, or TikTok; presence controls are best-effort) |
| Send media | `POST /v1/messages/media` |
| Send template | `POST /v1/messages/template` |
| Upload template header media | `POST /v1/templates/media` |
| Send Flow | `POST /v1/messages/flow` |
| Mark read / show typing | `POST /v1/messages/read`, `/v1/messages/typing` |
| List/read conversations | `GET /v1/conversations...` |
| Wait for inbound reply | `GET /v1/conversations/{contact}/messages/wait...` |
| Reconcile/cancel scheduled message | `GET`, `DELETE /v1/scheduled-messages/{id}` |
| Upload/list reusable media | `POST /v1/media`, `GET /v1/media?from=...` |
| List/sync templates | `GET /v1/templates?from=...`, `POST /v1/templates/sync` |
| Manage Flows | `/v1/flows` |
| Manage consent | `/v1/consent` and `/v1/consent/*` |

Consent configuration is per WABA. Copy supports `language: "es" | "en"`, editable opt-in/opt-out headings and bodies, and a footer. Because Meta Flows are immutable after publication, save copy with `PATCH /v1/consent/config` and apply it with `POST /v1/consent/enable`; Easyhook creates a deterministic version and routes future sends to it. `auto_opt_in_enabled: true` optionally schedules Easyhook's opt-in Flow 23 hours after the first live inbound interaction. Do not recreate that timer in an agent or workflow. Easyhook revalidates the service window and current opt-in/opt-out state before dispatch. External consent recorded through `POST /v1/consent` must include auditable evidence supplied by the customer.
| Hosted customer onboarding | `POST /v1/onboarding/sessions` |
| Manage webhook subscriptions | `/v1/webhooks`; update only events with `PATCH /v1/webhooks/{id}` |
| List Google reviews / aggregate rating | `GET /v1/reviews`, `GET /v1/reviews/summary` |
| Reply to a Google review | `PUT /v1/reviews/{review_id}/reply` |

For multimedia template headers, upload the approval example with
`POST /v1/templates/media`. Supplying `template_name`, `template_language`, and
`media_type` stores it as the default asset. At send time,
`POST /v1/messages/template` may omit `media` to use that default or provide
exactly one dynamic `media.link`, `media.id`, or reusable `media.name`. A
dynamic override must match the approved image, video, or document header type;
document media may also set `filename`.

Use the standardized interactive endpoint when the workflow needs up to three
reply or URL buttons across WhatsApp, Messenger, Instagram, or Telegram:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "¿Qué quieres hacer?",
  "buttons": [
    { "type": "reply", "title": "Agendar", "payload": "schedule" },
    { "type": "url", "title": "Cómo llegar", "url": "https://example.com/map" }
  ]
}
```

Send this body to `POST /v1/messages/interactive`. WhatsApp accepts either up
to three replies or one URL and cannot mix both types. URL clicks do not emit a
selection event. Reply selections from all four providers use
`message.quick_reply.payload`.

Messenger and Instagram additionally share a larger temporary quick-reply menu
through `POST /v1/messages/quick-replies`:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "¿Qué necesitas?",
  "quick_replies": [
    { "title": "Ventas", "payload": "sales" },
    { "title": "Soporte", "payload": "support" }
  ]
}
```

Subscribe to `message.quick_reply` and route by
`message.quick_reply.payload`. Keep `message.text` for display only.

Read the corresponding section in `public-api.md` before implementing an
endpoint. That document defines all accepted parameters and mutually exclusive
fields.

Template list, sync, and create responses include `meta_waba_id`. Treat that as
the provider WABA identifier; never substitute the internal Easyhook `waba_id`
UUID. Template creation accepts `parameter_format` as `POSITIONAL` or `NAMED`.
Retry-safe integrations should send a stable `Idempotency-Key`.

For every template operation, prefer `from` as the only account selector. The
API key fixes the organization and Easyhook derives the exact WABA from that
tenant-owned phone. If a request includes both `from` and `waba_id`, they must
resolve to the same WABA; otherwise Easyhook returns
`409 sender_waba_mismatch`. An unknown `from` returns `404 phone_not_found`
without falling back to the supplied WABA. Never retry either error against a
different WABA automatically.

## Acceptance Checklist

- API key remains server-side.
- No `tenant_id`, Supabase UUID, Meta access token, WABA ID, or Phone Number ID
  is hardcoded unless the normative endpoint explicitly requires it.
- All sender and recipient numbers use international digits.
- Every retryable write has a stable `Idempotency-Key`.
- HMAC is checked against raw bytes using constant-time comparison.
- Handler returns `2xx` before slow database/automation work.
- Messages and events are deduplicated.
- Scheduled sends persist `scheduled_message.id`, `client_reference`, and the
  final `message_id`; webhook/status correlation does not depend on timestamps.
- History does not trigger live bots.
- Failed status events and `sync.failed` are retained with their error details.
- Meta `status.pricing.billable` describes Meta pricing, not Easyhook billing.
  A successful public outbound API operation is charged according to the
  Easyhook wallet even when Meta labels the conversation `free_customer_service`.
- Logs redact API keys, webhook secrets, authorization codes, and provider
  tokens.
- Tests cover inbound, outbound/echo, media, reaction, failed status, and at
  least one duplicate delivery.
