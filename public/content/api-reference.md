# Easyhook Public API

Last updated: 2026-08-27

This document is the source of truth for customer-facing API behavior. Every API change must update this file in the same change set.

## Telecom

The number, SMS/MMS and call contract is provider-neutral. See [Telefonía](/telecom) for capability checks, schemas, security and billing lifecycle.

- `GET /v1/telecom/capabilities`
- `GET /v1/telecom/numbers`
- `GET /v1/telecom/numbers/available`
- `POST /v1/telecom/numbers/orders`
- `POST /v1/messages/text` with `channel: "sms"` when needed
- `POST /v1/calls`
- `POST /v1/consent` with `channel: "voice"` to record opt-in/opt-out for AI outreach
- `GET /v1/calls/{callId}`
- `POST /v1/calls/{callId}/actions/hangup`

The carrier callback is private infrastructure and is not a customer-authenticated endpoint.

SMS and MMS return `maximum_reserved_cost` rather than a quoted final price.
The hold is reduced to the final Easyhook tariff after the carrier confirms
the billable amount, and the unused portion is returned. Inbound SMS/MMS are
reserved and settled from the signed `message.received` callback's carrier
cost because there is no preceding customer request and no later inbound
`message.finalized` event.

Inbound carrier voice similarly reserves a refundable 60-minute maximum before
ringing an Easyhook endpoint. The final charge uses the signed `call.cost`
`total_cost` and billed duration, applies the current Easyhook voice tariff,
and returns the unused hold.

`POST /v1/calls` also accepts `handler: "ai"` for outbound phone calls. It
uses the outbound ElevenLabs agent explicitly bound to the Easyhook number
(which may also be its inbound agent), bridges it only after
the destination answers, and accepts a bounded scalar `context` object for
per-call variables. AI outreach requires explicit voice consent recorded via
`POST /v1/consent` and is throttled to one attempt per hour and three per
rolling 24 hours per tenant/number/contact. A successful AI call returns
`202` without a WebRTC token; media flows directly between Telnyx and
ElevenLabs.

The managed ElevenLabs handler currently supports `channel: "phone"` only.
Human WebRTC calls support both `phone` and `whatsapp`. A request combining
`handler: "ai"` with `channel: "whatsapp"` fails explicitly with
`voice_ai_phone_channel_required`; Easyhook does not switch a tenant's Meta
number from Graph/WebRTC signaling to SIP behind their back.

## Base URL

Production API URL:

```text
https://api.easyhook.dev
```

## Authentication

Customer API calls use an organization/tenant API key in the `Authorization` header.

```http
Authorization: Bearer eh_live_xxx
```

### Organization isolation

An API key belongs to exactly one Easyhook organization. The organization is
always derived from the key; customer API requests must not send `tenant_id`.

Resource selectors are resolved only inside that organization:

- `from` accepts an owned sender number or connected channel identifier.
- `phone_id` accepts an owned Easyhook phone UUID.
- `waba_id` accepts an owned Easyhook WABA UUID or Meta WABA ID.
- When more than one selector is supplied, every selector must resolve to the
  same resource.
- Easyhook never falls back to another phone or WABA when a selector cannot be
  resolved.
- `channel` is optional when `from` identifies exactly one compatible sender.
  When the same value belongs to more than one channel, Easyhook returns
  `409 ambiguous_sender` with `available_channels`; retry with an explicit
  `channel` instead of guessing.

Expected isolation errors:

| HTTP | Error | Meaning |
| --- | --- | --- |
| `400` | `tenant_id_not_allowed` | The customer request tried to override the organization from the API key. |
| `400` | `invalid_from` | The sender is not a valid supported identifier. |
| `404` | `phone_not_found` | The sender is missing from this organization, including when it belongs to another organization. |
| `404` | `waba_not_found` | The WABA is missing from this organization, including when it belongs to another organization. |
| `409` | `sender_phone_mismatch` | `from` and `phone_id` identify different owned phones. |
| `409` | `sender_waba_mismatch` | The selected sender does not belong to the supplied WABA. |
| `409` | `ambiguous_sender` | The same `from` is connected to multiple compatible channels; send `channel`. |

These rules apply to messages, media, templates, Flows, consent, read/typing
actions, scheduling, conversations, webhooks, and reusable assets.

## MCP For AI Agents

Easyhook provides a standalone Model Context Protocol server for Codex, Claude, and other MCP clients:

```text
easyhook-mcp-server
```

The server does not expose the API key or sender as tool arguments. They are fixed in the MCP process environment, and every read or outbound destination is checked against a required contact list before an Easyhook API request is made. Each contact includes a name and description so the agent knows who it may contact and when.

Install it in Codex:

```bash
codex mcp add easyhook \
  --env EASYHOOK_API_KEY=eh_live_xxx \
  --env EASYHOOK_FROM=15550100002 \
  --env EASYHOOK_CONTACTS='[{"phone":"15550100003","name":"QA Contact","description":"QA contact; use only for requested tests"}]' \
  -- npx -y easyhook-mcp-server
```

Equivalent `~/.codex/config.toml` configuration:

```toml
[mcp_servers.easyhook]
command = "npx"
args = ["-y", "easyhook-mcp-server"]
startup_timeout_sec = 90

[mcp_servers.easyhook.env]
EASYHOOK_API_KEY = "eh_live_xxx"
EASYHOOK_FROM = "15550100002"
EASYHOOK_CONTACTS = "[{\"phone\":\"15550100003\",\"name\":\"QA Contact\",\"description\":\"QA contact; use only for requested tests\"}]"
```

Available MCP tools:

| Tool | Purpose |
| --- | --- |
| `list_contacts` | List permitted contacts with their names and usage descriptions. |
| `send_text` | Send standard, humanized, or scheduled text. |
| `send_media` | Send media by reusable name, Meta media id, or public URL. |
| `send_template` | Send an approved WhatsApp template. |
| `send_flow` | Send a published WhatsApp Flow. |
| `send_consent_flow` | Send the WABA opt-in or opt-out Flow. |
| `list_templates` | List templates resolved from the configured sender. |
| `list_media` | List reusable media resolved from the configured sender. |
| `list_flows` | List Flows resolved from the configured sender. |
| `list_conversations` | List recent conversations for the configured sender, filtered to configured contacts. |
| `get_recent_messages` | Read inbound and outbound messages with one allowlisted contact. |
| `wait_for_message` | Wait up to five minutes for the next inbound message from one allowlisted contact. |

`EASYHOOK_CONTACTS` is a JSON array of `{ phone, name, description }`. Send and read tools accept either the configured name or phone. Formatted phones are normalized to digits. The legacy `EASYHOOK_ALLOWED_TO` comma-separated list remains supported when `EASYHOOK_CONTACTS` is absent. The API key and sender never become tool arguments. The Easyhook wallet, service-window, consent, template, and Meta policy checks still apply.

`list_conversations` and `get_recent_messages` use billable customer API reads.
`wait_for_message` is not billed. A wait timeout is a normal result and must not
be interpreted as permission for an agent to continue indefinitely.

Hosted onboarding supports WhatsApp, Messenger, Instagram, Telegram, TikTok,
Gmail, Outlook, Mercado Libre, and custom email where applicable. Disconnecting a sender is intentionally not exposed as
an MCP tool because it is a destructive tenant-administration action. Use the
tenant-scoped REST operation `DELETE /v1/senders/{account_id}` from an approved
management flow.

## Chatwoot

Easyhook can be used as the transport for a Chatwoot API Inbox. Chatwoot remains
the system of record for agents, teams, contacts, assignments, labels, notes,
automations, and conversation state. Easyhook only receives provider events and
sends agent replies.

### Setup

1. In Chatwoot, open **Profile settings > Access Token** and copy a user API
   token with access to the target account.
2. Copy the numeric Account ID from a Chatwoot URL such as
   `/app/accounts/7/...`.
3. In Easyhook, open **Integrations > Chatwoot**.
4. Enter the Chatwoot URL, Account ID and API token, then select one, several,
   or all available Easyhook channels.
5. Easyhook creates one independent Chatwoot API Inbox per selected channel,
   uses the channel display name as the inbox name, and assigns the provider
   avatar.
6. In Chatwoot, open the new inboxes, add the agents who may use them, and
   optionally rename them.

Both Chatwoot Cloud (`https://app.chatwoot.com`) and self-hosted installations
with a public HTTPS URL are supported. Do not create the API Inbox manually and
do not copy its Webhook URL, Inbox ID, Inbox Identifier or Webhook Secret into
Easyhook. Easyhook creates the API Inbox with its callback URL and its own
scoped event subscription already configured. The callback URL contains a
random secret and the Chatwoot token is stored in Easyhook's encrypted tenant
secret store. If an existing connected inbox has no avatar, Easyhook assigns
the corresponding provider avatar the next time its integrations are loaded.
Chatwoot still displays its standard API-channel icon in the sidebar; Chatwoot
Cloud does not expose an API setting to replace that small channel-type icon.

Chatwoot provisioning supports WhatsApp, Messenger, Instagram, Telegram,
Gmail, Outlook, generic IMAP/SMTP accounts, and Mercado Libre. Each selected
sender receives its own Chatwoot inbox so contacts and conversations cannot
cross channel boundaries.

### Behavior

- Live inbound text and media create or reuse a Chatwoot contact and
  conversation.
- Public outgoing agent messages are sent through the connected Easyhook
  sender.
- Gmail, Outlook, and IMAP/SMTP replies preserve the original subject and
  provider thread whenever that context is available. Attachments are fetched
  privately from Chatwoot, validated, and sent through the connected mailbox.
- Telegram replies are sent through the selected bot. Mercado Libre replies
  follow the question or post-purchase conversation represented by the
  Easyhook contact identifier.
- WhatsApp delivery states (`sent`, `delivered`, `read`, and `failed`) update
  the corresponding outgoing message in Chatwoot. Status correlation starts
  with messages sent after the integration version that stores the provider
  message ID.
- While an agent types in Chatwoot, Easyhook sends WhatsApp's typing indicator
  for the latest inbound message in that conversation. It stops automatically
  when the reply is sent or when Meta's indicator expires.
- WhatsApp does not provide a customer-typing webhook. Chatwoot therefore
  cannot show a real "customer is typing" animation for WhatsApp contacts.
- Private notes, incoming Chatwoot webhook echoes, and conversations belonging
  to other inboxes are ignored.
- Incoming provider traffic is free. Messages sent by an agent are charged as
  normal Easyhook outbound operations.
- WhatsApp free-form replies still require an open customer-service window.
  Outside that window, send an approved template through Easyhook.
- Email and Telegram do not use WhatsApp's 24-hour customer-service window.
  Provider-specific delivery and anti-spam policies still apply.
- Contacts and coexistence history are imported only when an organization
  administrator requests them from **Integrations > Chatwoot**.
- Delivery is idempotent by Easyhook event ID and Chatwoot message ID. Webhook
  retries do not create a second Chatwoot message.
- Live deliveries use a persistent outbox with automatic retries. A temporary
  Chatwoot or network failure does not discard the provider event.
- Easyhook downloads protected media inside the tenant boundary and uploads
  the file to Chatwoot server-to-server. Stored media is never made public for
  Chatwoot to retrieve it.

Disconnecting clears the API Inbox callback, removes the Easyhook event
subscription and deletes the Easyhook-to-Chatwoot mapping. It does not delete
the Chatwoot inbox, contacts or conversations.

### Contact and history import

Each connected WhatsApp inbox has independent **Import contacts** and **Import
history** actions. Contacts are upserted in Chatwoot by their stable Easyhook
identifier. History is available only for WhatsApp Business App coexistence
numbers whose owner authorized history sharing during onboarding and whose
normalized history is still available in Easyhook.

History import has these guarantees:

- Easyhook reuses the durable normalized History and App State Sync data. The
  phone does not have to be reconnected.
- Events are replayed in batches of at most 100 and processed asynchronously.
  The portal shows independent progress for contacts and messages.
- Batches are processed sequentially per import. Contact requests are paced
  and rate-limit responses are retried, so a large address book does not
  overwhelm Chatwoot.
- Messages are idempotent by their original Meta message ID. Repeating an
  import does not create another copy.
- The original message time is sent to Chatwoot as
  `external_created_at` and retained in
  `content_attributes.external_created_at`. Chatwoot Cloud can still render
  the bubble with its internal import time because its public API does not
  permit Easyhook to overwrite the database `created_at` value.
- New conversations created by the import remain resolved. Historical
  messages contain `content_attributes.easyhook_history: true`.
- Easyhook suppresses all outbound delivery from that Chatwoot inbox while an
  import is active. This prevents agent bots and automations evaluated by
  Chatwoot from sending historical replies to WhatsApp. It also temporarily
  blocks legitimate agent replies from that inbox until the import completes.
- If historical media is still downloadable, Easyhook attaches it. If Meta or
  Easyhook no longer has the file, the text message and original timestamp are
  imported without the attachment instead of dropping the message.

Chatwoot's public API does not expose a universal flag that disables all
internal automation evaluation during message creation. Easyhook therefore
guarantees transport suppression, not that a Chatwoot automation will produce
no internal activity. A direct database import would be required to change
Chatwoot's internal timestamps or bypass its internal event pipeline and is not
used because it would work only with self-hosted installations.

## n8n Community Node

Easyhook has verified n8n nodes:

```text
n8n-nodes-easyhook
```

In n8n, add a node and search for **Easyhook**. The verified nodes appear
directly in the node search. Self-hosted installations that disable verified
community nodes must enable them before Easyhook appears.

Credential setup:

| Field | Value |
| --- | --- |
| API Key | Your Easyhook API key, for example `eh_live_xxx`. |

The credential test calls `GET /v1/me`, so it only verifies that the API key is valid and can identify the organization.

Available nodes:

| Node | Purpose |
| --- | --- |
| `Easyhook` | Sends messages, controls conversations, handles email-only actions, sends WhatsApp templates/Flows, manages organization media, downloads private incoming media, and cancels scheduled messages. |
| `Easyhook Trigger` | Receives Easyhook webhook deliveries. Workflow activation registers the n8n Production URL automatically through `/v1/webhooks`. |

Main `Easyhook` operations:

| Resource | Operation | API endpoint used |
| --- | --- | --- |
| Message Action | Send Text | `POST /v1/messages/text` |
| Message Action | Send Text + Humanized Delivery | `POST /v1/messages/humanized-text` |
| Message Control | Mark as Read | `POST /v1/messages/read` |
| Message Control | Reply | `POST /v1/messages/reply` |
| Message Control | Show Typing | `POST /v1/messages/typing` |
| Message Control | React | `POST /v1/messages/reaction` |
| Message Action | Send Media | `POST /v1/messages/media` |
| WhatsApp Only | Send Template | `POST /v1/messages/template` |
| WhatsApp Only | Send Flow | `POST /v1/messages/flow` |
| WhatsApp Only | Record Opt-In or Opt-Out | `POST /v1/consent` |
| Media | Upload | `POST /v1/media` |
| Media | List | `GET /v1/media` |
| Media | Download | `GET /v1/media/{id}/download` |
| Media | Delete | `DELETE /v1/media/{id}` |
| Template | List | `GET /v1/templates?from=...` |
| Template | Sync From Meta | `POST /v1/templates/sync` |
| Cancel Scheduled Message | Cancel | `DELETE /v1/scheduled-messages/{id}` |
| Email Only | Send / Reply | `POST /v1/messages/email` |
| Email Only | Forward | `POST /v1/messages/email/forward` |
| Email Only | Archive / Mark Read / Mark Unread | `POST /v1/email/actions` |

Template sending in n8n defaults to manual entry because it is the most reliable path across self-hosted n8n environments:

1. Choose `Resource: WhatsApp Only`.
2. Choose `Operation: Send Template`.
3. Keep `Template Source: Enter Manually`.
4. Enter the approved template name and language code.
5. Add Header, Body, or Button variables in template order. Body row 1 fills `{{1}}`, row 2 fills `{{2}}`, and so on.

If your n8n instance can load dynamic options from Easyhook, switch `Template Source` to `Choose From Easyhook` to select templates and variables from Easyhook directly.

For webhooks in n8n:

1. Add `Easyhook Trigger` as the first workflow node.
2. Select the Easyhook API credential.
3. Select one provider; the event and scope lists update automatically.
4. Select a scope and, when applicable, choose a connected WABA, number, Messenger Page, or Instagram account from the filtered list.
5. Activate the workflow.

The node registers and removes the subscription automatically. It stores the one-time HMAC secret in n8n private workflow data and validates every delivery. No portal webhook or manual secret configuration is required.

When a webhook contains `message.media.url`, the URL is intentionally private.
Add an `Easyhook` node with `Resource: Media` and `Operation: Download`, map
`{{$json.message.media.url}}` into `Media URL`, and choose the output binary
field (default: `data`). The node authenticates the download with the same
Easyhook credential and emits n8n binary data for subsequent file, storage, or
AI nodes.

For a WhatsApp Business App history import, choose `Provider: WhatsApp` and `Event: Coexistence history (history.*)`, then select the organization, WABA, or number scope and activate the workflow **before** connecting the coexistence phone or requesting synchronization. `message.*` does not include historical imports. Easyhook sends batches of at most 100 events; the n8n trigger expands each batch into one output item per normalized event.

For WhatsApp, Easyhook exposes one consistent hierarchy in the portal, API webhooks, and n8n: **Organization → WABA → Number**. Meta Business Portfolios remain internal onboarding metadata. Templates, Flows, and consent configuration belong to a WABA; reusable media belongs to the Easyhook organization and can be sent through any compatible connected channel; conversations and customer-service windows belong to a number; contacts and consent evidence are isolated between WABAs.

Do not send `tenant_id` to public endpoints. Easyhook resolves the tenant from the API key. If a request includes `tenant_id`, the API returns:

```json
{ "error": "tenant_id_not_allowed" }
```

## Wallet And Billing

Easyhook is usage-based. There is no monthly platform-plan requirement. Telecom numbers are an explicit exception: each purchased number can have a one-time activation charge, a prorated initial calendar-month period, recurring rent charged in advance on the first day of later months, and metered messaging or voice usage as documented in [Telefonía](/telecom).

Wallets are scoped by organization/tenant. Each organization has its own balance, billing currency, usage ledger, top-ups, API charges, and media overage charges. If the same customer creates multiple organizations, each organization is funded separately. The billing currency is fixed by the first funded top-up and cannot be mixed while the wallet has balance or paid history.

Customers pay Meta directly for WhatsApp template fees. The Easyhook wallet only pays for Easyhook platform usage.

Billable in V1:

| Usage | Fee |
| --- | --- |
| Public customer API call that executes a supported operation | `0.01 MXN` or `0.001 USD` |
| Easyhook Inbox operation sent to a provider (send, reply, reaction, typing, read receipt, or email action) | `0.01 MXN` or `0.001 USD` |
| Media transfer beyond included quota | `3 MXN / GB` or `0.20 USD / GB` |
| Reusable media storage beyond included quota | `3 MXN / GB / month` or `0.20 USD / GB / month` |
| Received chat media storage beyond included quota | `3 MXN / GB / month` or `0.20 USD / GB / month` |

Not billable:

- Portal UI-only actions, including Inbox search, filters, navigation, pins, realtime refreshes, template management, Flow management, consent setup, logs, connection sync, and manual testing from **Probar API**.
- Meta webhooks used internally to update Easyhook state.
- Incoming messages and every Easyhook delivery to customer webhook subscriptions, including message, status, template, Flow, onboarding, account, and contact events.
- Meta template/message charges. Those stay between the customer and Meta.
- Media storage upload itself.

`Probar API` is free only through the authenticated portal flow. The portal
requires a single-use Cloudflare Turnstile verification, applies shared per-IP,
per-user, and per-organization burst limits, and sends a short-lived
server-signed assertion to the Easyhook API. Copying the public API request into
a script does not reproduce those controls and normal public API billing
applies. Portal sessions require a new sign-in after 7 days. The portal
currently has no daily free-operation quota.

Customer webhook relay is free as a companion to Easyhook usage, not an
unlimited standalone event bus. Organizations without wallet balance, a
successful top-up in the last 90 days, or charged Easyhook usage in that period
receive up to 10,000 **live** relayed events per calendar month. Commercially
active organizations are not subject to that evaluation allowance. Coexistence
history synchronization and explicit History replays do not consume the live
relay allowance; they remain bounded by their own job and replay limits. Provider
ingestion and the Easyhook Inbox continue even when the live customer relay
allowance is exhausted.

Included media quotas in V1:

| Quota | Included |
| --- | --- |
| Media transfer | `10 GB / month / tenant` |
| Reusable media storage | `1 GB / organization` |
| Received chat media storage | `100 GB / tenant` |
| Received chat media retention | `6 months` |

Media transfer includes customer API downloads and Easyhook-hosted reusable media served to providers when a customer sends by `media_name`. Received chat media is stored for up to `6 months`; storage is included until the tenant has more than `100 GB` of active received media. Reusable media does not expire; storage is included up to `1 GB` per organization. Template media is managed separately.

Media overages are charged monthly from the organization wallet by a scheduled Supabase cron job. The cron runs on the first day of each month and bills the previous month using the idempotent admin billing function:

```sql
select public.easyhook_bill_media_overages('2026-07-01');
```

The date identifies the billing month. Running the function twice for the same month does not double-charge the same tenant/category because each charge uses a stable idempotency key.

If the wallet has insufficient balance, billable public API calls return:

```json
{
  "error": "insufficient_balance",
  "billing": {
    "amount_cents": 1,
    "balance_after_cents": 0,
    "currency": "MXN"
  }
}
```

Use `Idempotency-Key` on POST/DELETE requests that your system may retry. Easyhook uses this key to avoid double charging the same API operation. For scheduled text, media, and template messages, it also prevents creating a second scheduled message and returns the original record with `idempotent_replay: true`.

```http
Idempotency-Key: order-123-send-confirmation
```

If no `Idempotency-Key` is sent, Easyhook treats each HTTP request as a separate billable operation.

USD wallets use a fractional accumulator because one API operation costs `0.001 USD`, one tenth of a cent. Easyhook deducts one USD cent every ten billable operations while preserving exact operation-level pricing. A zero USD balance blocks the first new billable operation; it does not grant fractional calls on credit.

Manual MXN or USD top-ups must be performed with the local Easyhook admin CLI.
It resolves the public organization reference, verifies the fixed wallet
currency, requires a payment reference and uses the audited, idempotent wallet
credit function:

```bash
easyhook recharge 500 MXN to EH-130FF0EC \
  --reference "SPEI-20260729-001"
```

Run the same command with `--dry-run` to validate the organization, project,
currency and resulting balance without writing. Setup and security details are
documented in the internal wallet administration runbook. Admins must
not edit `wallets.balance_cents` directly.

## Endpoint Index

Recommended customer API endpoints:

| Method | Endpoint | Scope | Use |
| --- | --- | --- | --- |
| `GET` | `/v1/me` | any valid key | Validate an API key and inspect its tenant/scopes. Useful for n8n credential tests. |
| `GET` | `/v1/senders` | any valid key | List provider-native sender identifiers. Use `account_id` as `from`. |
| `GET` | `/v1/senders/{account_id}/health` | any valid key | Read the normalized health of one tenant-owned sender without exposing provider credentials. |
| `DELETE` | `/v1/senders/{account_id}` | `onboarding:write` | Disconnect a tenant-owned channel by its provider-native sender identifier. Existing `messages:write` keys remain compatible. |
| `GET` | `/v1/conversations?from=...` | `messages:read` | List recent WhatsApp conversations for one tenant-owned sender. Existing `messages:write` keys remain compatible. |
| `GET` | `/v1/conversations/{contact}/messages?from=...` | `messages:read` | Read recent inbound and outbound WhatsApp messages with one contact. Existing `messages:write` keys remain compatible. |
| `GET` | `/v1/conversations/{contact}/messages/wait?from=...` | `messages:read` | Wait for the next inbound WhatsApp message from one contact. Intended for bounded MCP/agent conversations. |
| `POST` | `/v1/messages/text` | `messages:write` | Canonical text endpoint for WhatsApp, Telefonía/SMS, Messenger, Instagram, Telegram, Mercado Libre and TikTok. Send `channel` only when `from` is ambiguous. |
| `POST` | `/v1/messages/quick-replies` | `messages:write` | Send one text prompt with 1–13 quick-reply buttons through Messenger or Instagram. |
| `POST` | `/v1/messages/interactive` | `messages:write` | Send supported reply or URL buttons through WhatsApp, Messenger, Instagram, Telegram, or TikTok Business Messaging. TikTok accepts reply buttons only. |
| `POST` | `/v1/messages/email` | `messages:write` | Send a new email or reply through Gmail, Outlook, or a connected IMAP/SMTP account. |
| `POST` | `/v1/messages/humanized-text` | `messages:write` | Humanized text for WhatsApp, Messenger, Instagram, and Telegram. Presence controls are best-effort and never replace the actual send. |
| `POST` | `/v1/messages/read` | `messages:write` | Mark read on WhatsApp, Messenger, Instagram, or TikTok Business Messaging. |
| `POST` | `/v1/messages/reply` | `messages:write` | Contextual reply on WhatsApp, Messenger, Instagram, Telegram, or TikTok Business Messaging. |
| `POST` | `/v1/messages/typing` | `messages:write` | Show typing on WhatsApp, Messenger, Instagram, Telegram, or TikTok Business Messaging. |
| `POST` | `/v1/messages/reaction` | `messages:write` | Add or remove a reaction on WhatsApp or Telegram. |
| `POST` | `/v1/messages/media` | `messages:write` | Send compatible media through WhatsApp, Telefonía/MMS, Messenger, Instagram, Telegram, or TikTok Business Messaging. TikTok currently supports images; scheduled MMS is not yet supported. |
| `GET` | `/v1/telecom/capabilities` | `telephony:read` | Discover normalized Telnyx and WhatsApp Calling capabilities. |
| `GET` | `/v1/call-routing?phone_id={id}` | `telephony:read` | Read one tenant-owned Telnyx number's call distribution policy; add `channel=whatsapp` for a WhatsApp phone. |
| `PATCH` | `/v1/call-routing?phone_id={id}` | `telephony:write` | Configure the ordered destinations for one number. WhatsApp accepts portal/app only; Telnyx also accepts one pooled external-phone stage. |
| `POST` | `/v1/call-endpoints` | `telephony:write` | Register or heartbeat one web, mobile, API or SIP answering endpoint. |
| `POST` | `/v1/call-endpoints/{id}/token` | `telephony:write` | Issue a short-lived WebRTC JWT for an existing endpoint. |
| `POST` | `/v1/whatsapp/calling/permissions` | `telephony:write` | Send Meta's explicit business-initiated call permission request. |
| `POST` | `/v1/calls` | `telephony:write` | Start a prepaid Telnyx or WhatsApp call with an enforced maximum duration; `handler: "ai"` starts a consented outbound ElevenLabs call. |
| `POST` | `/v1/consent` | `telephony:write` or `messages:write` | Record tenant-scoped voice opt-in/opt-out evidence (or existing messaging consent). |
| `GET` | `/v1/calls/{id}` | `telephony:read` | Read normalized state, duration, assignment and failure details. |
| `GET` | `/v1/calls/{id}/signaling` | `telephony:read` | Read the outbound WhatsApp SDP answer when it becomes available. |
| `POST` | `/v1/calls/{id}/actions/claim` | `telephony:write` | Atomically claim an offered call; exactly one endpoint wins. |
| `POST` | `/v1/calls/{id}/actions/pre-accept` | `telephony:write` | Pre-accept an inbound WhatsApp call with an SDP answer. |
| `POST` | `/v1/calls/{id}/actions/accept` | `telephony:write` | Accept a claimed WhatsApp call. |
| `POST` | `/v1/calls/{id}/actions/decline` | `telephony:write` | Decline this endpoint and route to the next available agent. |
| `POST` | `/v1/calls/{id}/actions/hangup` | `telephony:write` | Terminate through the underlying provider. |
| `POST` | `/v1/messages/template` | `messages:write` | Send or schedule approved WhatsApp templates. |
| `POST` | `/v1/messages/flow` | `messages:write` | Send a published WhatsApp Flow inside the 24-hour window. |
| `GET` | `/v1/scheduled-messages/{id}` | `messages:read` | Reconcile a scheduled message, its WAMID, execution failure, and latest Meta status. Existing `messages:write` keys remain compatible. |
| `DELETE` | `/v1/scheduled-messages/{id}` | `messages:write` | Cancel a scheduled message that has not started processing. |
| `POST` | `/v1/media` | `media:write` | Upload permanent reusable media for the API-key organization. |
| `GET` | `/v1/media` | `media:read` | List the organization's reusable media library. |
| `GET` | `/v1/media/{id}/download` | `media:read` | Download Easyhook-hosted media bytes for customer CRMs/inboxes. |
| `DELETE` | `/v1/media/{id}` | `media:write` | Delete reusable media. |
| `GET` | `/v1/templates?from=...` | `templates:read` | List WhatsApp templates for the WABA behind `from`. |
| `POST` | `/v1/templates/sync` | `templates:write` | Sync templates from Meta into Easyhook. |
| `POST` | `/v1/templates/classify` | `templates:write` | Return non-blocking category advice without submitting to Meta. |
| `POST` | `/v1/templates` | `templates:write` | Create a WhatsApp template in Meta and store it locally. |
| `POST` | `/v1/templates/media` | `templates:write` | Upload image, video, or document header media and obtain the Meta creation handle. |
| `POST` | `/v1/templates/delete` | `templates:write` | Delete a WhatsApp template in Meta and locally. |
| `GET` | `/v1/flows?from=...` | `flows:read` | List WhatsApp Flows for the WABA behind `from`. |
| `POST` | `/v1/flows/sync` | `flows:write` | Sync WhatsApp Flows from Meta. |
| `POST` | `/v1/flows` | `flows:write` | Create a WhatsApp Flow. |
| `POST` | `/v1/flows/{id}/publish` | `flows:write` | Publish a WhatsApp Flow. |
| `DELETE` | `/v1/flows/{id}` | `flows:write` | Delete a WhatsApp Flow. |
| `GET` | `/v1/flows/{id}/submissions?from=...` | `flows:read` | List stored Flow submissions. |
| `GET` | `/v1/consent/config?from=...` | `flows:read` | Read WABA consent configuration. Also accepts `waba_id` or `phone_id`. |
| `PATCH` | `/v1/consent/config` | `flows:write` | Update WABA consent copy and custom keywords. Accepts `from`, `phone_id`, or `waba_id`. |
| `POST` | `/v1/consent/enable` | `flows:write` | Create/publish default opt-in and opt-out Flows and enable WABA consent. Accepts `from`, `phone_id`, or `waba_id`. |
| `POST` | `/v1/consent` | `messages:write` | Record consent evidence, or send the default opt-in/opt-out Flow when `mode` is provided. |
| `GET` | `/v1/consent/status?from=...&contact=...` | `messages:read` or legacy `messages:write` | Read service and marketing consent for one contact in the WABA behind `from`. |
| `PUT` | `/v1/contacts` | `messages:write` | Idempotently update Easyhook-local contact names for the WABA behind `from`. |
| `POST` | `/v1/onboarding/sessions` | `onboarding:write` | Create a hosted channel onboarding session owned by the API key tenant. |
| `POST` | `/v1/onboarding/sessions/send` | `onboarding:write` | Create an onboarding session and send its URL from an authorized WhatsApp number. |
| `GET` | `/v1/onboarding/sessions/{token}` | opaque session token | Read or open a hosted onboarding session. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | opaque session token | Complete WhatsApp embedded signup. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | opaque session token | Complete a direct hosted channel connection. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | opaque session token | Start a hosted provider OAuth flow. |
| `GET` | `/v1/webhooks` | any valid key | List webhook subscriptions owned by the API-key organization. |
| `GET` | `/v1/webhooks/options?provider=...&scope_type=...` | any valid key | Discover compatible providers, event filters, scopes, and public sender identifiers. |
| `POST` | `/v1/webhooks` | any valid key | Create a webhook subscription; its HMAC/auth secret is returned once. |
| `GET` | `/v1/webhooks/{id}` | any valid key | Read one owned webhook subscription without exposing its secret. |
| `PATCH` | `/v1/webhooks/{id}` | any valid key | Replace only the subscribed `events`; URL, secret, authentication, providers, and scope remain unchanged. |
| `DELETE` | `/v1/webhooks/{id}` | any valid key | Remove an owned webhook subscription. |
| `POST` | `/v1/webhooks/{id}/replay` | any valid key | Retry failed delivery batches, optionally filtered by `sync_id`. |
| `POST` | `/v1/webhooks/{id}/history-replays` | any valid key | Re-send stored messages or contacts for `phone_id` using `replay_type`. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | any valid key | Read persistent History replay progress. |
| `POST` | `/v1/messages/channel/text` | `messages:write` | Deprecated compatibility alias; new integrations use `/v1/messages/text`. |
| `POST` | `/v1/messages/sms` | `messages:write` | Deprecated compatibility alias for Telefonía; new integrations use `/v1/messages/text` with `channel: "sms"` when needed. |
| `POST` | `/v1/messages/channel/media` | `messages:write` | Send Messenger, Instagram, Telegram, or TikTok media by compatible provider reference or public link. |
| `POST` | `/v1/messages/channel/media/upload` | `messages:write` | Upload media to Easyhook temporarily and send it through Messenger or Instagram. |

Portal/admin endpoints exist for onboarding, API-key management, webhook management, and Meta webhook ingestion. They are listed near the end of this document so customers can recognize them, but new product integrations should use the recommended endpoints above.

Use `POST /v1/messages/reaction` with `from`, `to`, `message_id`, and `emoji`. An empty `emoji` removes the current reaction.

## Messenger And Instagram Quick Replies

Easyhook exposes the common text quick-reply contract supported by Messenger
and Instagram. `from` is the connected Page or Instagram account ID, and `to`
is the provider-scoped contact ID received in Easyhook webhooks.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/quick-replies \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "17841400000000001",
    "to": "17841400000000002",
    "body": "¿Cómo podemos ayudarte?",
    "quick_replies": [
      { "title": "Ventas", "payload": "sales" },
      { "title": "Soporte", "payload": "support" }
    ]
  }'
```

Rules:

- Send between 1 and 13 replies.
- `title` is visible to the contact and accepts at most 20 characters.
- `payload` is an application-defined stable value and accepts at most 1,000
  characters.
- Only text quick replies are normalized across both providers. Provider-only
  phone, email, and image variants are intentionally not part of this endpoint.
- Instagram quick replies are not available in the desktop experience.

When the contact chooses an option, subscribe to `message.quick_reply`:

```json
{
  "type": "message.received",
  "channel": "instagram",
  "message": {
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Route automation by `message.quick_reply.payload`; use `message.text` or
`message.quick_reply.title` only as the label shown to the person.

## Multichannel Interactive Buttons

Use one contract for conversational buttons on WhatsApp, Messenger, Instagram,
and Telegram. This operation is free-form conversation traffic, not a WhatsApp
template:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/interactive \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "123456789012345",
    "to": "15550100002",
    "body": "¿Qué quieres hacer?",
    "buttons": [
      { "type": "reply", "title": "Agendar", "payload": "schedule" },
      { "type": "reply", "title": "Hablar con alguien", "payload": "agent" }
    ]
  }'
```

To open a page such as a map, use a public HTTPS URL:

```json
{
  "type": "url",
  "title": "Cómo llegar",
  "url": "https://example.com/map"
}
```

Common rules:

- `buttons` contains 1–3 items and each `title` has at most 20 characters.
- `reply` requires a stable `payload` of at most 64 UTF-8 bytes.
- `url` requires a public HTTPS URL.
- WhatsApp requires an open customer-service window. Outside it, use an
  approved template.
- WhatsApp accepts either up to three `reply` buttons or one `url` button; it
  cannot mix both types in the same message. Easyhook rejects that combination
  before contacting Meta.
- Messenger, Instagram, and Telegram can mix reply and URL buttons.
- URL clicks do not produce a selection webhook. Reply selections are
  normalized as `message.quick_reply`.
- The older `/v1/messages/quick-replies` endpoint remains available for
  Messenger and Instagram menus with up to 13 temporary reply options.

## Gmail

Gmail is represented as a normal Easyhook channel. The organization API key
selects the organization and `from` must be the exact connected Gmail address.
Incoming email is stored in the shared Inbox and delivered through customer
webhooks as `message.received`. Messages sent from Gmail outside Easyhook are
stored as outbound events without creating a second customer conversation.

Send a new plain-text email:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "soporte@example.com",
    "to": "cliente@example.net",
    "subject": "Seguimiento",
    "body": "Hola, damos seguimiento a tu solicitud."
  }'
```

Use `html` when rich email is required. Supplying both `body` and `html`
creates a multipart message with a plain-text fallback:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Tu solicitud está lista",
  "body": "Tu solicitud está lista.",
  "html": "<p>Tu solicitud está <strong>lista</strong>.</p>"
}
```

Reply inside an existing thread using the normalized `message.id` received in
the inbound webhook:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Re: Seguimiento",
  "body": "Gracias por confirmar.",
  "reply_to_message_id": "provider-message-id"
}
```

`reply_to_message_id` is the normalized `message.id` from the inbound webhook.
Easyhook uses it to resolve the provider-specific reply operation. Most
integrations should not send `thread_id`, `in_reply_to`, or `references`; those
fields remain optional advanced controls for callers that already own the
provider values.

The normalized Gmail message fields are:

| Field | Description |
| --- | --- |
| `message.text` | Plain-text body or a safe text fallback derived from HTML. |
| `message.subject` | Email subject. |
| `message.html` | Original HTML body when present. Treat it as untrusted content. |
| `message.thread_id` | Gmail thread ID used for replies. |
| `message.message_id_header` | RFC Message-ID used by `in_reply_to`. |
| `message.in_reply_to` | RFC reply header from the received message. |
| `message.references` | RFC references chain. |
| `message.attachments` | Private attachment metadata with `media_asset_id`, file name, MIME type, and size. |
| `message.is_read` | Provider read state. |
| `message.label_ids` | Gmail labels used for Inbox filters. |
| `message.inference_classification` | Outlook `focused` or `other`. |
| `message.flags` | IMAP flags such as `\Seen` and `\Flagged`. |

`POST /v1/messages/email` accepts up to 10 attachments and 20 MB decoded in
total. Supported formats are JPEG, PNG, WebP, MP4, 3GPP, AAC, M4A, MP3, AMR,
OGG, PDF, plain text, Word, Excel, and PowerPoint:

```json
{
  "attachments": [
    {
      "filename": "report.pdf",
      "content_type": "application/pdf",
      "content_base64": "JVBERi0xLjc..."
    }
  ]
}
```

Additional normalized routes:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/v1/messages/email/forward` | Forward `message_id` to another address with an optional `note`. |
| `POST` | `/v1/email/actions` | `mark_read`, `mark_unread`, or `archive` a message. |
| `POST` | `/v1/email/drafts` | Create a draft. |
| `PUT` | `/v1/email/drafts/{draft_id}` | Replace a draft. |
| `POST` | `/v1/email/drafts/{draft_id}/send` | Send a draft. |

Google sends Gmail changes through Pub/Sub. Easyhook acknowledges the Pub/Sub
request immediately, resolves changes with `users.history.list`, deduplicates
messages by Gmail message ID, and advances the stored history cursor only after
processing succeeds. Gmail watches expire, so Easyhook schedules an automatic
renewal 24 hours before each expiration. The admin-only
`POST /v1/channels/gmail/watch/renew-all` endpoint remains available for
operations and recovery.

### Google Cloud configuration

1. Enable the Gmail API and Pub/Sub API.
2. Configure the OAuth redirect URI as
   `https://api.easyhook.dev/v1/channels/gmail/oauth/callback`.
3. Create a Pub/Sub topic and grant
   `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on
   that topic.
4. Create a push subscription whose URL is
   `https://api.easyhook.dev/v1/channels/gmail/webhook?token=YOUR_RANDOM_TOKEN`.
5. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_OAUTH_STATE_SECRET`, `GMAIL_PUBSUB_TOPIC`, and
   `GMAIL_PUBSUB_VERIFICATION_TOKEN` in the backend.
6. Verify that Easyhook Cloud Tasks is configured. Each successful Gmail
   connection schedules its next watch renewal automatically.

Easyhook requests `openid`, `userinfo.email`, `userinfo.profile`, and
`gmail.modify`. The restricted Gmail scope is used to receive mail, send
replies, preserve threads, and maintain message state in the shared Easyhook
Inbox. Easyhook does not use Gmail data for advertising. The first Gmail
release supports plain text, HTML, attachments, new messages, threaded
replies, state changes, forwarding, and drafts.

Disconnecting a Gmail channel from **Organization** stops its Gmail watch,
revokes the stored OAuth grant, and removes the encrypted credential from
Easyhook.

### Google verification recording

Record one continuous, silent screen capture with short on-screen labels:

1. Sign in to Easyhook and open **Connect > Gmail**.
2. Click **Connect Gmail** and show the Google consent screen, including the
   account and requested Gmail permission.
3. Complete consent and show the connected Gmail account in Easyhook.
4. Send a message from an external address to the connected Gmail account.
5. Show the same sender, subject, and body arriving in the Easyhook Inbox.
6. Reply from Easyhook and show the reply in the same thread in Gmail.
7. Send a new email through `POST /v1/messages/email` and show it arriving at
   the recipient.

Suggested restricted-scope justification:

> Easyhook is a multichannel messaging API and shared inbox. The
> `gmail.modify` scope is required so an account owner can connect Gmail,
> receive and read messages in Easyhook, send new messages and threaded
> replies, and maintain message state. Gmail data is isolated by organization,
> encrypted in transit and at rest, and is not used for advertising.

## Outlook and IMAP/SMTP

Outlook and generic email accounts use the same public contract as Gmail.
Connect Outlook with Microsoft OAuth or connect another provider with its IMAP
and SMTP settings. After connection, use the exact email address as `from`:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support@company.com",
    "to": "customer@example.net",
    "subject": "Order update",
    "body": "Your order is ready."
  }'
```

The same endpoint accepts `html`, `reply_to_message_id`, `thread_id`,
`in_reply_to`, and `references` for every email provider. Use
`reply_to_message_id` with the inbound webhook's `message.id` for the simplest
threaded reply. Responses have one normalized shape:

```json
{
  "ok": true,
  "provider": "outlook",
  "channel_id": "channel-id",
  "message_id": "provider-message-id",
  "thread_id": "provider-thread-id"
}
```

Incoming messages from all email providers produce `message.received` with
`message.subject`, `message.text`, optional `message.html`, thread headers,
provider filter metadata, and privately stored attachments. HTML is untrusted
input and must be sanitized or rendered inside a sandbox.

Outlook subscriptions are protected with a random Microsoft Graph
`clientState`, processed asynchronously, and renewed before expiration.
Configure these backend secrets:

- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_STATE_SECRET`
- `MICROSOFT_OAUTH_REDIRECT_URI` set to
  `https://api.easyhook.dev/v1/channels/outlook/oauth/callback`

The Microsoft application needs delegated `User.Read`, `Mail.ReadWrite`, and
`Mail.Send`, plus `openid`, `profile`, `email`, and `offline_access`.

IMAP/SMTP credentials are validated at connection time and stored in the
encrypted Easyhook secret vault. Easyhook records the mailbox's current UID
cursor, then polls only new inbox messages. Use TLS, an app password, or a
provider-specific SMTP credential; never use a personal password when the mail
provider supports app passwords.

Customer API sends through Gmail, Outlook, and IMAP/SMTP consume
`message.email.send`. Provider operations from the Easyhook Inbox use the
equivalent `inbox.*` operation and the same per-operation price. UI-only Inbox
work does not consume wallet balance.

Starting a call from the Inbox does not create a separate API-operation charge.
For Telnyx calls, the reserved carrier amount is finalized from signed provider
cost events and the unused hold is returned. WhatsApp Calling carrier charges
are billed directly by Meta to the customer's WABA; Easyhook charges its
`call.per.minute` platform fee only after the call connects. A rejected or
unanswered call therefore has no Easyhook call charge.

A WhatsApp call-permission request places a refundable wallet hold first. The
operation is charged only after Meta accepts the request; a provider rejection
releases the complete hold.

The WhatsApp 24-hour customer-service window does not apply to email or
Telegram. These channels can send at any time permitted by their provider.

## Telegram

Connect a Telegram bot from **Connect > Telegram** using the token created by
BotFather. Easyhook validates the token, stores it in the encrypted tenant
secret vault, and configures a Telegram webhook protected by Telegram's
`X-Telegram-Bot-Api-Secret-Token` header.

After connection, use the standard text endpoint:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@my_easyhook_bot",
    "to": "123456789",
    "body": "Hola desde Easyhook"
  }'
```

Telegram images, video, audio, and documents can be sent through
`POST /v1/messages/media` with a public `link`. Incoming Telegram updates are
normalized to the same `message.received` contract used by the other channels.
Incoming media currently includes Telegram file metadata; automatic file
storage and a public Easyhook download URL are not part of the first release.

Disconnecting a Telegram channel removes its protected Telegram webhook before
Easyhook deletes the encrypted bot token.

## TikTok Business Messaging

Connect TikTok from **Connect > TikTok Business Messaging**. Easyhook uses
TikTok's account-holder authorization flow. It requests
`message.list.read`, `message.list.send`, and `message.list.manage` for
messaging, plus `user.info.basic`, `user.account.type`, `user.info.username`,
and `user.info.profile` to identify the connected business account. It does not
request advertiser, campaign, pixel, measurement, or CTX permissions.

The selected TikTok profile must already be a **Business Account**. Easyhook
checks the account type during OAuth and returns
`tiktok_business_account_required` without storing the connection when TikTok
reports a personal account. For connections created before this validation,
the same error is returned on send instead of incorrectly requesting another
reconnection. Change the account type in TikTok and then authorize it again.

TikTok Business Messaging is currently unavailable for Business Accounts
registered in the United States, European Economic Area, Switzerland, or the
United Kingdom. Easyhook preserves this provider restriction as
`tiktok_business_messaging_region_unsupported`; reconnecting the same account
does not resolve it. A business cannot initiate a new TikTok conversation. After a
user messages the business, TikTok permits at most 10 business replies during
the following 48 hours. Easyhook returns
`tiktok_messaging_window_closed_or_quota_reached` when the provider rejects a
send for this policy.

Use the provider-native identifiers from the webhook without prefixes:

- `account.id` is the connected TikTok Business Account open ID and is used as
  `from`.
- `contact.id` is the stable remote user identifier. Preserve it exactly and
  use it as `to` for later calls.
- `message.thread_id` is the provider conversation identifier. Easyhook also
  accepts it as `to` for backward compatibility and provider-level debugging.
- `message.id` is the provider message ID and the message idempotency key.

The standard text, reply, typing, read, interactive reply-button, image, and
scheduled-text endpoints resolve TikTok from `from`. Incoming text, image,
video, reply-button, read, and privacy events use the same normalized Easyhook
envelope as other channels. Stored media uses a private Easyhook URL and must
be downloaded with the organization API key.

## Conversations And Recent Messages

Conversation reads are tenant-scoped by the API key and number-scoped by `from`. Public responses contain customer-visible phone numbers, provider message IDs, normalized message content, and delivery status. They do not expose tenant IDs, Supabase row IDs, token references, raw Meta payloads, or private storage URLs.

New API keys include `messages:read`. Keys created before this scope was introduced can use these endpoints when they already have `messages:write`.

### List conversations

```bash
curl "https://api.easyhook.dev/v1/conversations?from=15550100002&limit=20" \
  -H "Authorization: Bearer eh_live_xxx"
```

Query parameters:

| Field | Required | Description |
| --- | --- | --- |
| `from` | Yes | Tenant-owned WhatsApp sender. Formatting is normalized to digits. |
| `limit` | No | Between 1 and 100. Defaults to 20. |
| `before` | No | ISO 8601 `next_cursor` from the previous response. |

Response:

```json
{
  "from": "15550100002",
  "conversations": [
    {
      "contact": {
        "phone": "15550100003",
        "name": "Ana"
      },
      "last_message": {
        "id": "wamid...",
        "direction": "in",
        "type": "text",
        "text": "Hola",
        "media": null,
        "reaction": null,
        "status": null,
        "source": "webhook",
        "timestamp": "2026-07-18T16:00:00.000Z"
      },
      "message_count": 4,
      "service_window": {
        "open": true,
        "expires_at": "2026-07-19T16:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

`message_count` is the number of messages found in the scanned result window, not a permanent lifetime counter.

### Read one conversation

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages?from=15550100002&limit=50" \
  -H "Authorization: Bearer eh_live_xxx"
```

Messages are returned oldest to newest within each page, which lets an agent or inbox process them in conversational order.

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "messages": [
    {
      "id": "wamid...",
      "direction": "in",
      "type": "text",
      "text": "¿Ya quedó mi pedido?",
      "media": null,
      "reaction": null,
      "status": null,
      "source": "webhook",
      "timestamp": "2026-07-18T16:00:00.000Z"
    },
    {
      "id": "wamid...",
      "direction": "out",
      "type": "text",
      "text": "Sí, ya está listo.",
      "media": null,
      "reaction": null,
      "status": "read",
      "source": "api",
      "timestamp": "2026-07-18T16:01:00.000Z"
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

Possible errors:

| Status | Error | Meaning |
| --- | --- | --- |
| `400` | `missing_required_fields` | `from` or the path contact is missing/invalid. |
| `400` | `invalid_limit` | `limit` is outside 1-100. |
| `400` | `invalid_before` | `before` is not an ISO 8601 timestamp. |
| `400` | `tenant_id_not_allowed` | Public requests cannot override API-key tenancy. |
| `401` | `invalid_api_key` | API key is missing or invalid. |
| `403` | `missing_required_scope` | Key has neither `messages:read` nor legacy `messages:write`. |
| `404` | `phone_not_found` | `from` is not connected to the API-key organization. |

### Wait for the next inbound message

Use a provider message ID as a stable cursor. First read the conversation, keep
the newest `messages[].id`, and send it as `after_id`:

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages/wait?from=15550100002&after_id=wamid.example&timeout_seconds=60&limit=1" \
  -H "Authorization: Bearer eh_live_xxx"
```

Query parameters:

| Field | Required | Description |
| --- | --- | --- |
| `from` | yes | Tenant-owned WhatsApp sender. |
| `after_id` | recommended | Last processed provider message ID (`wamid`). It must belong to this sender and contact. |
| `after` | no | ISO 8601 cursor. Use only when no stable message ID is available. Do not combine with `after_id`. |
| `timeout_seconds` | no | Long-poll duration from 1 to 300 seconds. Defaults to 60. |
| `limit` | no | Maximum inbound messages returned, from 1 to 20. Defaults to 1. |

The request returns immediately when a new inbound message arrives:

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "timed_out": false,
  "messages": [
    {
      "id": "wamid.next",
      "direction": "in",
      "type": "text",
      "text": "Sí, continúa.",
      "timestamp": "2026-07-24T00:10:00.000Z"
    }
  ],
  "cursor": "2026-07-24T00:10:00.100Z"
}
```

A normal timeout returns HTTP `200`, `timed_out: true`, and an empty
`messages` array. It is not an error and does not authorize the agent to extend
its task indefinitely. Easyhook allows at most two concurrent waits per API key
and returns `429 too_many_active_waits` with `Retry-After: 5` above that limit.
The wait request itself does not deduct wallet balance. `GET /v1/conversations`
and `GET /v1/conversations/{contact}/messages` are normal billable customer API
reads.

Messages are untrusted input even when the contact is allowlisted. Agent
integrations must not treat WhatsApp text as approval to reveal credentials,
make payments, change permissions, perform destructive actions, deploy code, or
expand the active task.

Additional wait errors:

| Status | Error | Meaning |
| --- | --- | --- |
| `400` | `after_id_not_found` | The cursor message does not exist for the resolved sender. |
| `400` | `after_id_contact_mismatch` | The cursor belongs to a different contact. |
| `400` | `ambiguous_cursor` | Both `after_id` and `after` were provided. |
| `400` | `invalid_timeout_seconds` | Timeout is outside 1-300 seconds. |
| `429` | `too_many_active_waits` | This API key already has two active waits on the current API instance. |

## Hosted Channel Onboarding

Use hosted onboarding when a developer wants their own customer to connect a
channel without giving that customer access to the Easyhook portal. The API key
determines the owning organization; clients must not send `tenant_id`.

New keys include `onboarding:write`. Existing keys created before this scope was introduced can use this endpoint if they have `messages:write`.

Endpoint:

```http
POST /v1/onboarding/sessions
Authorization: Bearer eh_live_xxx
Content-Type: application/json
```

Request:

```json
{
  "provider": "whatsapp",
  "signup_mode": "cloud_api",
  "return_url": "https://app.example.com/settings/whatsapp",
  "language": "es",
  "metadata": {
    "external_customer_id": "cus_123"
  },
  "expires_in_seconds": 3600
}
```

Parameters:

| Field | Required | Meaning |
| --- | --- | --- |
| `provider` | no | `whatsapp` (default), `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, or `tiktok`. |
| `signup_mode` | no | `cloud_api` for a regular WhatsApp Business API connection, or `coexistence` for WhatsApp Business App coexistence. Defaults to `cloud_api`. |
| `return_url` | no | HTTPS URL where the hosted page can send the customer after completion. |
| `language` | no | `es`, `en`, or `pt-BR`. Defaults to `es`. |
| `metadata` | no | JSON object echoed back in onboarding webhooks. |
| `expires_in_seconds` | no | Lifetime from `300` to `3600` seconds. Defaults to one hour. |

Response:

```json
{
  "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
  "session": {
    "id": "session_uuid",
    "status": "pending",
    "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
    "organization": {
      "name": "appcreatorbr",
      "slug": "appcreatorbr",
      "logo_url": "https://project.supabase.co/storage/v1/object/public/organization-logos/tenant/logo.png"
    },
    "signup_mode": "cloud_api",
    "language": "es",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": {
      "external_customer_id": "cus_123"
    },
    "expires_at": "2026-07-11T18:00:00.000Z",
    "opened_at": null,
    "completed_at": null
  }
}
```

When the customer completes authorization on the hosted page, Easyhook stores
the channel under the organization that owns the API key. Subscribe to
`onboarding.*` webhooks to receive completion events in your app. Sessions
expire after at most one hour and are consumed after the first successful
completion. Completion delivery is persisted in Easyhook's webhook outbox and
retried with the same idempotency guarantees as message events. The payload
includes `onboarding.connection` with the connected channel's canonical
`account_id`, display name, provider, and its Easyhook channel reference when
that provider uses a channel record.

When the organization has uploaded a logo in the Easyhook portal, `organization.logo_url`
is included automatically and the hosted page displays that brand. Clients do not send or
override the logo when creating a session.

The hosted Easyhook page uses these token-scoped support endpoints internally:

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/onboarding/sessions/{token}` | Public opaque session token | Read/open a non-expired hosted onboarding session. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | Public opaque session token | Exchange the Meta authorization code and complete the connection for the owning organization. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | Public opaque session token | Complete Telegram, IMAP/SMTP, Messenger, or Instagram authorization. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | Public opaque session token | Start Gmail, Outlook, Mercado Libre, or TikTok OAuth. |

Customer applications normally create a session and redirect the user to the returned Easyhook `url`; they should not recreate the hosted page's token completion flow.

For Messenger, Easyhook matches the selected Page against Meta's asset-specific
`pages_messaging` grant. It does not substitute a different Page that was only
granted for comments or another permission. If completion returns
`meta_page_access_unavailable`, Meta authorized the business login but did not
expose a usable messaging credential for the selected Page. Confirm that the
same Facebook user has full access to that Page, select it in Facebook Login for
Business, grant `pages_messaging`, and retry the hosted session. The response
includes Meta's diagnostic message when available.

To create the same hosted session and immediately send its URL from a WhatsApp number owned by the API-key organization, use:

```http
POST /v1/onboarding/sessions/send
```

It accepts `from`, `to`, `signup_mode`, `language`, `return_url`, `metadata`, and `expires_in_seconds`. Easyhook sends a localized fixed message that always contains the generated URL. Custom `body` values are rejected to prevent sending a message without the link. Sending free-form text requires an open 24-hour customer-service window. The response contains both the onboarding session and the sent message result.

### Hosted Onboarding Examples

curl:

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "signup_mode": "cloud_api",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" }
  }'
```

TypeScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/onboarding/sessions", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    signup_mode: "cloud_api",
    return_url: "https://app.example.com/settings/whatsapp",
    metadata: { external_customer_id: "cus_123" },
  }),
});

const { url } = await res.json();
```

Python:

```python
import requests

response = requests.post(
    "https://api.easyhook.dev/v1/onboarding/sessions",
    headers={
        "Authorization": f"Bearer {EASYHOOK_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "signup_mode": "cloud_api",
        "return_url": "https://app.example.com/settings/whatsapp",
        "metadata": {"external_customer_id": "cus_123"},
    },
)

url = response.json()["url"]
```

## Sender Identifiers

Use `from` as the customer-visible sender identifier. Do not use internal Supabase ids in customer integrations unless you are doing a portal/admin operation.

The canonical value is the `account.id` delivered in Easyhook webhooks. The same
value can be passed directly as `from`, regardless of provider. `GET /v1/senders`
returns every sender available to the API key with its canonical `account_id`.
Each sender also includes a `health` object. Query one sender directly with:

```http
GET /v1/senders/{account_id}/health
Authorization: Bearer eh_live_...
```

`health.status` is `connected`, `unreachable`,
`reauthorization_required`, or `unknown`. `unreachable` represents a provider
or network failure that may be temporary. `reauthorization_required` means the
credential or provider asset is no longer usable and the customer must reconnect
that channel. `checked_at`, `code`, and the sanitized `message` are included for
diagnostics; credentials and provider tokens are never returned.

For push-based monitoring, subscribe a customer webhook to
`channel.health_changed`. Easyhook emits it only when the normalized health
state changes, not after every periodic check.

To disconnect a sender without opening the Easyhook portal, URL-encode that
canonical value and call:

```http
DELETE /v1/senders/{account_id}
Authorization: Bearer eh_live_...
```

Example response:

```json
{
  "ok": true,
  "provider": "instagram",
  "account_id": "17841400000000001",
  "disconnected": true,
  "secret_removed": true
}
```

The operation is tenant-scoped and idempotent. Repeating it after the sender
has already been removed returns `200` with `already_disconnected: true`.
Easyhook removes its stored channel and credentials; provider-side assets and
business accounts are not deleted.

This REST operation is the supported automation contract. It is also available
in the portal API explorer as a copyable request, but execution stays disabled
there to prevent an accidental destructive test.

For WhatsApp, use the Meta Phone Number ID from `account.id`:

```json
{ "from": "123456789012345" }
```

The connected business phone number remains accepted for convenience:

```json
{ "from": "15550100001" }
```

For Messenger, Instagram, and Telegram, use the provider-native `account.id`:

```json
{ "from": "123456789012346" }
```

```json
{ "from": "17841400000000001" }
```

```json
{ "from": "SELLER_ID" }
```

Rules:

- For WhatsApp phone numbers, always include the international country calling code. Easyhook accepts
  E.164 (`+57 300 000 0000`) and digits-only (`573000000000`) values, plus common
  formatting with spaces, hyphens, dots, parentheses, or the `00`
  international prefix.
- A WhatsApp recipient can also be the opaque BSUID received in `contact.user_id`,
  `message.from_user_id`, or `status.recipient_user_id`. Pass it unchanged in
  Easyhook's `to`; do not add `+`, remove punctuation, or validate it as E.164.
  Easyhook sends phone numbers to Meta in `to` and BSUID/parent-BSUID values in
  Meta's dedicated `recipient` field.
- Do not send national-only numbers. Easyhook does not guess a country because
  the same leading digits can identify a different valid country calling code.
- The `from` sender must belong to the tenant that owns the API key.
- Instagram usernames are passed without a leading `@`. Use `example_business`, not `@example_business`.
- Legacy aliases such as `page_<PAGE_ID>`, `ig_<INSTAGRAM_ID>`, and
  `telegram_<BOT_ID>` remain accepted, but new integrations should map
  `account.id` directly.
- If the API key tenant does not own the sender, Easyhook returns
  `channel_or_phone_not_found` or `phone_not_found` without exposing another
  organization's data.
- Legacy `phone_id`, `waba_id`, and `channel_id` style inputs are still accepted where documented for internal/backward compatibility, but external customer examples should use `from`.
- Mexico: `+52 55 0000 0001`, `525500000001`, `+52 1 55 0000
  0001`, and `5215500000001` resolve to the same WhatsApp identity.
- Argentina: common mobile input such as `+54 11 15 2345 6789` is normalized
  to its international mobile identity (`5491100000000`).
- The same parser covers NANP countries and territories and the rest of Latin
  America; no country-specific default is applied.

Examples accepted for WhatsApp:

```json
{ "from": "+57 300 123 4567", "to": "00 54 9 11 2345-6789" }
```

```json
{ "from": "5511000000000", "to": "+56 9 0000 0000" }
```

## Customer Service Window

Free-form messages (`text` and session `media`) are only allowed inside the WhatsApp 24-hour customer service window.

If the window is closed, Easyhook returns:

```json
{ "error": "customer_service_window_closed", "allowed_message_type": "template" }
```

If Easyhook cannot find a matching contact or recent inbound event for the `to` value, the same error includes a diagnostic reason:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "reason": "recipient_not_found_or_no_recent_inbound_message",
  "hint": "Check the recipient country code or WhatsApp ID. Free-form text/media requires an inbound message in the last 24 hours; otherwise send an approved template."
}
```

Templates can be sent outside the 24-hour window when the template is approved and opt-in requirements are satisfied.

### 72-hour Free Entry Point

WhatsApp can open a 72-hour free-entry-point window when a customer starts the conversation from an eligible Click-to-WhatsApp ad or Facebook Page call-to-action and the business replies within Meta's required time.

This window is separate from the 24-hour customer service window:

- The 24-hour window controls whether free-form text, media, interactive messages, and Flows can be sent.
- The 72-hour free-entry-point window affects Meta pricing. It does not extend free-form sending permissions.
- After the first 24 hours, Easyhook continues to require an approved template and valid consent even when the free-entry-point window is still active.
- Easyhook does not open the 72-hour window from the inbound referral alone. It waits for a Meta status webhook. It uses `conversation.expiration_timestamp` when supplied, and also supports current per-message pricing webhooks identified by `pricing.type = free_entry_point`.

Official Meta references: [Messages webhook object and referral context](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object) and [free-entry-point status callback](https://www.postman.com/meta/whatsapp-business-platform/request/85iyhv5/status-message-sent-business-reply-to-user).

When a free-form send is rejected while this pricing window exists, the response includes:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "window_expires_at": "2026-07-11T10:00:00.000Z",
  "free_entry_point": {
    "active": true,
    "expires_at": "2026-07-13T10:01:00.000Z",
    "conversation_id": "conversation_123",
    "note": "This window affects Meta pricing only. Approved templates are still required outside the 24-hour customer service window."
  }
}
```

## Scheduled Delivery

Message send endpoints accept an optional `at` field:

- `POST /v1/messages/text`
- `POST /v1/messages/media`
- `POST /v1/messages/template`

`at` must be an ISO 8601 date/time. If it includes `Z` or an offset, Easyhook respects that timezone. If no timezone is included, Easyhook treats the value as UTC.

Examples:

```json
{ "at": "2026-07-02T18:30:00-06:00" }
```

```json
{ "at": "2026-07-03T00:30:00Z" }
```

```json
{ "at": "2026-07-03T00:30:00" }
```

Scheduling behavior:

- Without `at`, the endpoint sends immediately.
- With `at`, Easyhook stores the message and schedules a Cloud Tasks dispatch for that time.
- The response is `202 Accepted` with a `scheduled_message.id`.
- `client_reference` is an optional application identifier of up to 200 characters. Easyhook returns it in scheduled lifecycle and correlated delivery-status webhooks.
- Send a stable `Idempotency-Key` header when creating a scheduled message. Retrying the same operation returns the original record instead of creating another Cloud Task.
- Scheduled free-form `text` and `media` must be inside the WhatsApp 24-hour customer service window at the scheduled time.
- Scheduled templates may be outside the 24-hour customer service window, but must still use approved templates and satisfy opt-in requirements.
- If a scheduled free-form message would be outside the window, Easyhook returns `scheduled_customer_service_window_closed`.
- Scheduling errors expose `retryable`, `delivery_state`, and `fallback_allowed`. Only use an alternate delivery path when `fallback_allowed` is `true`; an `unknown` delivery state may already have reached Meta.

Scheduled response example:

```json
{
  "ok": true,
  "scheduled": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_text",
    "status": "scheduled",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-02T18:00:00.000Z"
  }
}
```

### Reconcile Scheduled Message

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Requires `messages:read`; existing `messages:write` keys remain compatible. Use this endpoint after timeouts, worker retries, or webhook downtime.

```bash
curl https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

After Easyhook sends the message, `message_id` contains Meta's WAMID. `provider_status` advances independently as Meta reports `sent`, `delivered`, `read`, or `failed`.

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "delivered",
    "provider_status_at": "2026-07-03T00:30:03.000Z",
    "sent_at": "2026-07-03T00:30:01.000Z",
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-03T00:30:03.000Z"
  }
}
```

Terminal execution failures expose whether the operation can be retried and whether a template fallback is safe:

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "failed",
    "error": {
      "code": "customer_service_window_closed",
      "retryable": false,
      "delivery_state": "not_sent",
      "fallback_allowed": true
    }
  }
}
```

`delivery_state: unknown` means Easyhook cannot prove that the provider rejected the attempt. Do not send a fallback automatically. `fallback_allowed: true` is only returned when Easyhook knows the original free-form message was not sent and an approved template may be attempted.

### Cancel Scheduled Message

Endpoint:

```http
DELETE /v1/scheduled-messages/{scheduled_message_id}
```

Requires `messages:write`. Cancellation is tenant-scoped by the API key. Only messages still in `scheduled` status can be cancelled.

Example:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

Success response:

```json
{
  "ok": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "cancelled"
  }
}
```

## WhatsApp Contact Metadata

Use this endpoint to create or update a contact name stored by Easyhook for the
WABA resolved from `from`:

```http
PUT /v1/contacts
```

```bash
curl -X PUT https://api.easyhook.dev/v1/contacts \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: crm-contact-15550100004-v3" \
  -d '{
    "from": "123456789012345",
    "contact": "15550100004",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "target": "easyhook"
  }'
```

`from` accepts the connected phone or Meta Phone Number ID. `contact` accepts
an international WhatsApp phone identifier or an opaque BSUID. Easyhook
resolves the contact inside the WABA behind `from`; contacts are never shared
between organizations or WABAs. At least one of `full_name` or
`preferred_name` is required.

`target` is required so the caller cannot confuse the two kinds of write:

- `easyhook`: update only Easyhook's local contact metadata. A changed value
  emits `contact.updated`; repeating the same state is a no-op.
- `provider`: request a real write to the WhatsApp Business App address book.
  Meta does not currently expose that operation, so Easyhook returns HTTP 422
  with `provider_contact_write_unsupported` and changes nothing locally.

```json
{
  "ok": true,
  "changed": true,
  "target": "easyhook",
  "provider_contact_book_updated": false,
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": {
    "id": "15550100004",
    "phone": "15550100004",
    "user_id": null,
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "name": "Ana",
    "updated_at": "2026-08-12T18:30:00.000Z"
  }
}
```

This limitation is distinct from two supported Meta features: sending a
contact card as a WhatsApp message and receiving provider-originated contact
changes through `smb_app_state_sync`. Neither is a Cloud API write into the
WhatsApp Business App address book. See Meta's official [contact-message
request](https://www.postman.com/meta/whatsapp-business-platform/request/e9dulgq/send-contact-message)
and [SMB App State Sync webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

## Consent: Opt-In / Opt-Out

For business-initiated template messages, Easyhook requires the contact to have
opt-in recorded in Easyhook. The opt-in can come from the managed WhatsApp Flow
or from `POST /v1/consent` when the customer collected auditable permission in
another system. Enabling managed WABA consent is required only to send the
Easyhook opt-in or opt-out Flow; it is not required for externally recorded
consent.

If the contact has not opted in and the managed Flow is enabled, Easyhook
returns:

```json
{ "error": "opt_in_required", "required_action": "send_consent_flow" }
```

If the managed Flow is disabled, `required_action` is `record_opt_in`. API
clients can record consent through `POST /v1/consent` or enable managed consent
and send the Flow. `consent_not_enabled` is returned only when a client tries to
send the Easyhook consent Flow while that WABA feature is disabled.

The Easyhook record is an operational safeguard, not a substitute for valid permission. The customer remains responsible for collecting truthful, explicit and auditable consent under Meta policy and applicable law. Configure Meta billing separately in [WhatsApp Manager](https://business.facebook.com/latest/settings/whatsapp_account); the Easyhook wallet does not pay Meta's template charges. See Meta's [opt-in guidance](https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in/) and [pricing documentation](https://developers.facebook.com/docs/whatsapp/pricing/).

If a contact is opted out, Easyhook blocks business-initiated template sends with `recipient_opted_out`. Free-form text, media, and Flow messages are still allowed when the contact has an open 24-hour customer service window, because the contact initiated that session.

Easyhook records consent automatically when a WhatsApp Flow submission includes these boolean fields:

| Field | Meaning |
| --- | --- |
| `service_opt_in` | Contact opted in to service/utility messages. |
| `marketing_opt_in` | Contact opted in to marketing messages. |
| `service_opt_out` | Contact opted out of service/utility messages. |
| `marketing_opt_out` | Contact opted out of marketing messages. |

Clear opt-out phrases such as `Ya no quiero recibir mensajes`, `dame de baja`, `no me contactes`, `stop`, `unsubscribe`, or the common typo `unsuscribe` do not immediately unsubscribe the contact. If WABA consent is active, Easyhook records a pending opt-out request and sends the published opt-out WhatsApp Flow so the contact can confirm whether they want to stop service messages, marketing messages, or both. The existing effective consent remains unchanged until the Flow is submitted. An unconfirmed request expires after one hour and may then be requested again. Easyhook's fixed phrases cannot be removed; `custom_keywords` only adds business-specific phrases.

### Optional automatic opt-in

Set `auto_opt_in_enabled` to `true` when enabling or updating the WABA configuration to schedule the opt-in Flow 23 hours after a contact's first live inbound interaction with that WhatsApp number.

- The option is disabled by default and applies per WABA.
- One automatic request is created per contact and sender number.
- History imports never schedule it.
- At dispatch time Easyhook revalidates that consent remains enabled, the contact has neither opted in nor opted out, and the 24-hour service window is still open.
- If any check fails, Easyhook cancels the task without sending.
- This internal automation does not count as a customer API call. Meta's own messaging charges and policies still apply.

### Enable WABA Consent

Endpoint:

```http
POST /v1/consent/enable
```

Requires `flows:write`.

This creates or reuses two versioned Flows for the WABA, publishes them, and marks WABA consent as active:

| Flow name | Purpose |
| --- | --- |
| `easyhook_consent_preferences_<revision>_opt_in` | Collect service/utility and marketing opt-in. |
| `easyhook_consent_preferences_<revision>_opt_out` | Confirm service/utility and marketing opt-out. |

The two Flows are separate Meta assets so the opt-in experience only shows opt-in choices, and the opt-out experience only shows opt-out choices. Meta Flows are immutable after publication. Calling this endpoint with changed copy creates a new deterministic revision; unchanged copy reuses the current revision.

```bash
curl -X POST https://api.easyhook.dev/v1/consent/enable \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "es",
      "business_name": "Clínica Acme",
      "opt_in_message_body": "Revisa qué mensajes quieres recibir de {business_name}.",
      "opt_in_message_cta": "Confirmar preferencias",
      "opt_in_screen_title": "Preferencias de comunicación",
      "opt_in_heading": "Confirma tus preferencias",
      "opt_in_body": "Elige qué mensajes quieres recibir.",
      "opt_out_message_body": "Administra los mensajes que recibes de {business_name}.",
      "opt_out_message_cta": "Administrar preferencias",
      "opt_out_screen_title": "Preferencias de comunicación",
      "opt_out_heading": "Dejar de recibir mensajes",
      "opt_out_body": "Elige qué mensajes quieres cancelar.",
      "footer": "Puedes cambiar estas preferencias después."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel my reminders"]
  }'
```

### Get WABA Consent Config

```http
GET /v1/consent/config?from=15550100001
```

Requires `flows:read`. Also accepts `waba_id` or `phone_id` for legacy/admin usage.

### Update WABA Consent Config

```http
PATCH /v1/consent/config
```

Requires `flows:write`. Use this to save copy and add customer-specific opt-out keywords. Fixed Easyhook opt-out keywords are still enforced. `language` accepts `es`, `en`, or `pt-BR` and controls Easyhook-managed labels.

Message and form copy are intentionally separate:

| Fields | Where they appear |
| --- | --- |
| `opt_in_message_body`, `opt_out_message_body` | Message bubble that opens the Flow. Supports `{business_name}`. |
| `opt_in_message_cta`, `opt_out_message_cta` | Button in that message bubble. |
| `opt_in_screen_title`, `opt_out_screen_title` | Top bar of the opened Flow. |
| `opt_in_heading`, `opt_out_heading` | Heading inside the form. |
| `opt_in_body`, `opt_out_body` | Explanation inside the form. |
| `footer` | Caption at the bottom of the form. |

Older configurations that only have `opt_in_body` or `opt_out_body` keep their previous send behavior until saved with the new message fields.

Saving configuration does not mutate a published Meta Flow. Call `POST /v1/consent/enable` after changing copy to create and activate the corresponding version.

```bash
curl -X PATCH https://api.easyhook.dev/v1/consent/config \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "en",
      "business_name": "Acme Clinic",
      "opt_in_message_body": "Review the messages you want to receive from {business_name}.",
      "opt_in_message_cta": "Confirm preferences",
      "opt_in_screen_title": "Communication preferences",
      "opt_in_heading": "Confirm your preferences",
      "opt_in_body": "Choose which messages you want to receive.",
      "opt_out_message_body": "Manage the messages you receive from {business_name}.",
      "opt_out_message_cta": "Manage preferences",
      "opt_out_screen_title": "Communication preferences",
      "opt_out_heading": "Stop messages",
      "opt_out_body": "Choose which messages you no longer want to receive.",
      "footer": "You can change these preferences later."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel reminders", "stop promos"]
  }'
```

### Send Consent Flow

Endpoint:

```http
POST /v1/consent
```

Requires `messages:write`. This is a WhatsApp Flow message, so it requires an open 24-hour customer service window.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "mode": "opt_in",
    "body": "Optional message override for this send",
    "cta": "Review"
  }'
```

Allowed `mode` values: `opt_in`, `opt_out`.

`body` and `cta` are optional per-send overrides. If omitted, Easyhook uses the corresponding `copy.opt_*_message_body` and `copy.opt_*_message_cta` values from the WABA consent configuration. They do not modify the published Flow form.

`opt_in` sends `easyhook_consent_preferences_opt_in`. `opt_out` sends `easyhook_consent_preferences_opt_out`.

The WABA must have consent enabled and the customer-service window must be open. A successful response includes `accepted: true`, `delivery_status: "pending"`, and a `wamid`: this means Meta accepted the Flow request, not that the device displayed it. Subscribe to `status.*` and correlate by `wamid` to observe `sent`, `delivered`, `read`, or `failed`.

### Record Consent Manually

Endpoint:

```http
POST /v1/consent
```

Requires `messages:write`.

Use this when the customer collected opt-in/opt-out evidence outside Easyhook, for example with their own website form, CRM action, or custom WhatsApp Flow.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "scope": "marketing",
    "status": "opt_in",
    "source": "customer_form",
    "evidence": {
      "form_id": "form_123",
      "accepted_at": "2026-07-02T18:00:00.000Z"
    }
  }'
```

Allowed `scope` values: `service`, `marketing`.

Allowed `status` values: `opt_in`, `opt_out`, `pending_opt_out`.

An `opt_in` record must include non-empty `evidence`. Store enough information
to demonstrate what the person accepted and when, such as a form version,
timestamp, source URL, or external submission id. Easyhook stores the evidence
and applies the resulting consent state; it does not certify that the collection
method satisfies Meta policy or local law. The organization using the API
remains responsible for obtaining valid consent and honoring opt-out requests.

### Get Contact Consent Status

```http
GET /v1/consent/status?from=123456789012345&contact=15550100002
```

Requires `messages:read`. For backward compatibility, API keys created before
this read scope existed may use `messages:write`. `from` accepts the connected WhatsApp `account.id`,
Phone Number ID, or business phone number. The contact is resolved inside the
WABA behind that sender; contacts and consent are never shared between WABAs.
`to` and `recipient` are accepted as aliases for `contact`.

```bash
curl -X GET 'https://api.easyhook.dev/v1/consent/status?from=123456789012345&contact=15550100002' \
  -H "Authorization: Bearer eh_live_xxx"
```

```json
{
  "consent": {
    "contact": "15550100002",
    "account": { "id": "123456789012345" },
    "service": {
      "status": "opt_in",
      "updated_at": "2026-07-30T18:00:00.000Z",
      "source": "whatsapp_flow",
      "pending_opt_out": true,
      "pending_opt_out_at": "2026-08-01T05:30:00.000Z",
      "pending_opt_out_expires_at": "2026-08-01T06:30:00.000Z"
    },
    "marketing": {
      "status": "opt_out",
      "updated_at": "2026-07-31T18:00:00.000Z",
      "source": "customer_api"
    }
  }
}
```

Each scope returns the effective status: `opt_in`, `opt_out`, or `unknown`.
`unknown` means Easyhook has no recorded choice for that scope; it does not
mean that the person opted in. `pending_opt_out` is separate metadata and does
not replace a confirmed `opt_in`; it remains `true` for at most one hour while
Easyhook waits for Flow confirmation. Evidence is intentionally excluded from this
read endpoint. Subscribe to `consent.updated` to receive changes without
polling.

## Errors

Common errors:

| Error | Meaning |
| --- | --- |
| `invalid_api_key` | Missing, invalid, revoked, or insufficient-scope API key. |
| `tenant_id_not_allowed` | Public API request included `tenant_id`; tenant comes from the API key. |
| `missing_required_fields` | Required payload fields are missing. |
| `phone_not_found` | The `from` number is not connected to the organization that owns the API key. The response identifies `from` as the invalid field and includes a corrective hint. |
| `channel_or_phone_not_found` | The unified send endpoint could not resolve `from` as a WhatsApp number or channel alias connected to the API key organization. |
| `channel_not_enabled` | `from` resolved to a non-WhatsApp channel that is not enabled for public sending yet. |
| `unsupported_message_type` | The endpoint does not support the requested message type. |
| `invalid_whatsapp_recipient` | The unified endpoint resolved WhatsApp, but `to` is neither a valid international phone nor a valid opaque WhatsApp BSUID. |
| `phone_or_template_not_found` | The selected template could not be resolved for the WABA behind `from`. |
| `phone_or_flow_not_found` | The selected Flow could not be resolved for the WABA behind `from`. |
| `template_not_approved` | The template exists but is not approved by Meta. |
| `flow_not_published` | The Flow exists locally but is not published in Meta, so it cannot be sent. |
| `consent_not_enabled` | The managed WABA consent Flow has not been activated; enable it before trying to send that Flow. |
| `opt_in_required` | Template send needs known opt-in recorded in Easyhook. |
| `recipient_opted_out` | Easyhook has the recipient marked as opted out, so business-initiated templates are blocked. |
| `customer_service_window_closed` | Free-form text/media is blocked outside the 24-hour window. If no matching contact or recent inbound event exists, the response includes `reason: "recipient_not_found_or_no_recent_inbound_message"`. |
| `scheduled_customer_service_window_closed` | Scheduled free-form text/media would be outside the 24-hour window at `at`; the response has `delivery_state: "not_sent"` and permits template fallback. |
| `conversation_policy_temporarily_unavailable` | Easyhook could not verify the WhatsApp service window due to a temporary database failure. No message was sent. The response includes `retryable: true`, `delivery_state: "not_sent"`, and `request_id`; retry shortly using the same `Idempotency-Key`. |
| `insufficient_balance` | The organization wallet does not have enough balance for the operation. Recharge it before retrying. |
| `scheduled_message_create_failed` | Easyhook could not persist or enqueue the schedule; inspect `retryable`, `delivery_state`, and `fallback_allowed` before retrying. |
| `scheduled_delivery_not_configured` | Scheduled delivery is not configured for this backend deployment. |
| `scheduled_message_not_cancellable` | The scheduled message is already processing, sent, failed, or cancelled. |
| `meta_send_failed` | Meta rejected the send request; response includes sanitized Meta details. |

## Deprecated Text Alias

Endpoint:

```http
POST /v1/messages/send
```

This compatibility alias resolves `from` against the API-key tenant and returns
the `Deprecation: true` response header. New integrations use
`POST /v1/messages/text`.

Current public behavior:

- WhatsApp text is enabled.
- Messenger and Instagram text are enabled when `from` resolves to an active connected channel for the API key tenant.
- Existing WhatsApp endpoints remain supported for backward compatibility.

Required fields for WhatsApp text:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned WhatsApp phone number or Messenger/Instagram channel alias. |
| `to` | string | WhatsApp recipient number, Messenger PSID, or Instagram IGSID. |
| `type` | string | Optional. Defaults to `text`; currently only `text` is supported. |
| `body` | string | Message text. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/send \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"text","body":"Hola desde Easyhook"}'
```

Success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Common Examples

Set these variables once:

```bash
export EASYHOOK_API_KEY="eh_live_xxx"
export EASYHOOK_FROM="15550100001"
export CUSTOMER_WA="15550100002"
```

### Send WhatsApp Text

curl:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Hola desde Easyhook\"
  }"
```

Python:

```python
import os
import requests

resp = requests.post(
    "https://api.easyhook.dev/v1/messages/text",
    headers={
        "Authorization": f"Bearer {os.environ['EASYHOOK_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "from": os.environ["EASYHOOK_FROM"],
        "to": os.environ["CUSTOMER_WA"],
        "body": "Hola desde Easyhook",
    },
    timeout=20,
)
resp.raise_for_status()
print(resp.json())
```

TypeScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/messages/text", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.EASYHOOK_FROM,
    to: process.env.CUSTOMER_WA,
    body: "Hola desde Easyhook",
  }),
});

if (!res.ok) throw new Error(await res.text());
console.log(await res.json());
```

### Schedule A Text Message

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Recordatorio programado\",
    \"at\": \"2026-07-07T13:10:00-06:00\"
  }"
```

Cancel it:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

### Send A Template

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"template\": {
      \"name\": \"order_ready\",
      \"language\": \"en_US\"
    },
    \"parameters\": {
      \"body\": [\"Example User\"]
    }
  }"
```

### Upload Reusable Media And Send By Name

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"name\": \"promo_july\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"

curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"type\": \"image\",
    \"media_name\": \"promo_july\",
    \"caption\": \"Promo de julio\"
  }"
```

### Send Each WhatsApp Media Type By Reusable Name

```bash
# Image
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"image\",\"media_name\":\"promo_image\",\"caption\":\"Image caption\"}"

# Video
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"video\",\"media_name\":\"promo_video\",\"caption\":\"Video caption\"}"

# Audio
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"audio\",\"media_name\":\"intro_audio\"}"

# Document
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"document\",\"media_name\":\"price_list\",\"filename\":\"prices.pdf\",\"caption\":\"Price list\"}"

# Sticker
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"sticker\",\"media_name\":\"thanks_sticker\"}"
```

### Send A Consent Flow

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"mode\": \"opt_in\"
  }"
```

### Send A Custom WhatsApp Flow

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"flow_name\": \"lead_capture\",
    \"body\": \"Complete your information.\",
    \"cta\": \"Open form\",
    \"flow_token\": \"lead_123\"
  }"
```

### Minimal n8n HTTP Request Setup

Use:

| n8n field | Value |
| --- | --- |
| Method | `POST` |
| URL | `https://api.easyhook.dev/v1/messages/template` |
| Authentication | Bearer Auth |
| Body Content Type | JSON |

Body:

```json
{
  "from": "15550100001",
  "to": "15550100002",
  "template": {
    "name": "hello_world",
    "language": "en_US"
  }
}
```

`template.language` is required unless the template name is unique in that WABA and Easyhook can resolve it safely.

In the `n8n-nodes-easyhook` community node, `Choose From Easyhook` synchronizes the selected sender's templates and lists only approved definitions. `Enter Manually` resolves the same definition from its typed name and selected language. Both sources can automatically generate fields for header text or media, body variables, dynamic URL buttons, quick reply payloads, and copy-code values. Select `Custom Components (JSON)` to send raw Meta components instead.

The custom n8n field accepts either a raw components array or `{ "components": [...] }`. Do not include `from`, `to`, `template`, or `language` because the node supplies them separately. Media links must be public HTTPS URLs, and URL button parameters contain only the dynamic template variable value. See the package README for complete text and media examples.

## Send Text Message

Endpoint:

```http
POST /v1/messages/text
```

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned `account.id`, WhatsApp business phone, or backward-compatible channel alias. |
| `to` | string | WhatsApp recipient phone or BSUID, Messenger PSID, Instagram IGSID, Telegram chat id, or Mercado Libre recipient id. |
| `body` | string | Message text. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `at` | string | ISO 8601 date/time for scheduled delivery. Supported for WhatsApp, Messenger, Instagram, Telegram, and Mercado Libre text. |
| `phone_id` | string | Legacy Easyhook phone row id. Prefer `from`. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","body":"Hola desde Easyhook"}'
```

WhatsApp success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

Non-WhatsApp success response:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

## Read, Typing, Reply, Reaction, And Humanized Text

Easyhook exposes the same endpoints across providers and rejects unsupported
operations explicitly with HTTP `422 operation_not_supported`. Unsupported
operations are not billed.

| Provider | Read | Typing | Reply | Reaction | Humanized text |
| --- | --- | --- | --- | --- | --- |
| WhatsApp | Yes | Yes | Yes | Yes | Yes |
| Messenger | Yes | Yes | Yes | No | Yes |
| Instagram | Yes | Yes | Yes | No | Yes |
| Telegram | No | Yes | Yes | Yes | Yes |
| TikTok Business Messaging | Yes | Yes | Yes | No | Yes |
| Gmail, Outlook, IMAP/SMTP | Use Email Only actions | No | Yes | No | No |
| Mercado Libre | No | No | No | No | No |

WhatsApp read receipts and typing indicators require an inbound WhatsApp
message id (`wamid`). Messenger and Instagram use the provider message id.
Telegram typing requires the destination chat id and reactions require the
Telegram message id.

Mark a message as read:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/read \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

Show typing:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/typing \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

Humanized text applies only controls supported by the selected provider. For
example, Telegram sends a typing action but does not fabricate a read receipt.
WhatsApp Cloud API does not expose a customer typing webhook in Easyhook V1.

### Coexistence History

Coexistence history callbacks are accepted quickly and processed asynchronously through Cloud Tasks. Easyhook persists normalized chunks before processing, works in batches of at most 100 events, and treats the Meta message ID as an idempotency key. Synchronization is included at no additional charge. Only one active synchronization is accepted per number, while an organization can process two numbers concurrently; additional numbers remain queued and resume automatically without consuming failure attempts. Another request for the same number returns `409 coexistence_sync_in_progress` with the current progress.

Historical messages do not execute live consent keyword handling or replay Flow submission side effects.

Historical inbound messages are delivered as `message.received`; historical outbound messages are delivered as `message.echo`. Both expose `message.source: history`, `message.direction`, explicit `message.from` and `message.to`, and the available synchronization metadata under `message.history`.

The subscription filter is `history.*`, but each event inside the batch uses the normalized public `type` `message.received` or `message.echo`. The delivery body is `{ "type": "sync.batch", "sync": {...}, "events": [...] }`; batches contain at most 100 events. A consumer must process every element of `events` and deduplicate using `message.id`.

Create the customer webhook subscription with the `history.*` filter before connecting the coexistence number or requesting synchronization if the integration needs the historical import. The portal endpoint `POST /v1/meta/whatsapp/phones/coexistence-sync` starts the initial Meta synchronization after onboarding consent. It is not an unrestricted historical export and must be used during Meta's onboarding eligibility window. Once completed, use Easyhook replay instead of requesting the import from Meta again.

During coexistence onboarding, the business must allow history sharing in the WhatsApp Business App and should keep the app open while the initial synchronization starts. Meta error `2593109` means history sharing is disabled; Easyhook normalizes it as `type: sync.failed` for `history.*` subscribers.

Consumers receive an Easyhook batch rather than Meta's raw callback. Process each normalized element in `events`. Build the conversation key from `account.id + ":" + (contact.user_id ?? contact.id)`, deduplicate with `message.id`, order a conversation by `message.timestamp`, and prevent live auto-reply logic when `message.source` is `history`. Deliveries are at-least-once and retry up to five times. WhatsApp can supply a stable Business-scoped User ID (BSUID) instead of a phone; Easyhook preserves it in `contact.id`/`contact.user_id` and stores a phone alias when Meta supplies one. The complete mapping contract is documented in [Customer Webhooks: Coexistence History](/webhooks#coexistence-history).

The same BSUID or eligible parent BSUID can be used as Easyhook's `to` for normal WhatsApp sends. Easyhook maps it to Meta's dedicated `recipient` property. Authentication
templates that use one-tap, zero-tap, or copy-code delivery still require a
phone number; Meta can reject a BSUID destination with error `131062`.

Historical media is asynchronous. The initial message can contain `message.media.storage_status: pending`. If Meta still exposes the file, Easyhook later emits `message.media_available` with the same `message.id` and a protected Easyhook download URL. Missing or expired Meta media never blocks the text/history import.

Meta History covers up to approximately 180 days, excludes groups, and normally exposes downloadable historical media only for recent messages (approximately 14 days). It does not mirror a complete mobile backup. Easyhook supports `media_mode: metadata`, `recent_media` (default, excluding video), and `all_recent_media`.

The portal request body is:

```json
{
  "tenant_id": "TENANT_UUID",
  "phone_id": "LOCAL_PHONE_UUID",
  "media_mode": "recent_media"
}
```

Subscribers to `history.*` also receive `sync.started`, `sync.progress`, `sync.completed`, and `sync.failed`. Failed HTTP deliveries retry up to five times and respect a valid `Retry-After`.

Two recovery operations are available and serve different purposes:

- `POST /v1/webhooks/{id}/replay` retries failed delivery batches already created for that webhook. It accepts optional `sync_id` and `limit` (maximum 100 failed batches).
- `POST /v1/webhooks/{id}/history-replays` creates a persistent replay for one WhatsApp number. It accepts `phone_id`, `replay_type` (`history` or `contacts`), and optional `max_events` (maximum 100,000). The webhook must subscribe to `history.*` for messages or `smb_app_state_sync.*` for contacts.

Only one active replay of each type is allowed per webhook and number. Poll `GET /v1/webhooks/{id}/history-replays/{replay_id}` for `pending`, `processing`, `completed`, or `failed`. Replayed batches contain `sync.replay: true`. Consumers must remain idempotent because delivery is at-least-once.

### Coexistence App State Sync

The same coexistence synchronization request also asks Meta for WhatsApp Business App contact/state data. Subscribe to `smb_app_state_sync.*` before synchronization to receive each imported record as a normalized `contact.updated` event under `contact_update`.

State sync and history are complementary: `smb_app_state_sync.*` carries contact/app updates, while `history.*` carries historical messages. An integration rebuilding both contacts and conversations must subscribe to both filters before starting the sync. See [Customer Webhooks: Coexistence App State Sync](/webhooks#coexistence-app-state-sync) for the payload and identity rules.

### Reactions And Unsupported WhatsApp Messages

Easyhook receives reactions from both directions:

- Customer reactions arrive as public webhook `type: message.received`.
- Reactions made from the WhatsApp Business App in coexistence arrive as public webhook `type: message.echo`.
- The precise filter/debug event remains in the `X-Easyhook-Provider-Event` header (`message.reaction` or `smb_message_echo.reaction`).
- `message.reaction.message_id` is the provider `wamid` of the message being reacted to.
- `message.reaction.emoji` contains the emoji. An empty string removes a previous reaction.

Normalized webhook fragment:

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.HBg...",
      "emoji": "❤️"
    }
  }
}
```

Send a reaction:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reaction \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid...",
    "emoji": "👍"
  }'
```

Use an empty `emoji` to remove the current reaction.

Send a contextual text reply:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reply \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid.HBg...",
    "body": "Respuesta relacionada con este mensaje"
  }'
```

`message_id` must be the original WhatsApp message ID. Easyhook verifies that
`from` belongs to the API-key organization and sends Meta's message context so
WhatsApp displays the quoted reply.

WhatsApp circular video notes currently reach Cloud API as `message.unsupported` with error `131051` and `unsupported.type: video_note`. Meta does not include a media id or downloadable URL in that payload. Easyhook preserves this subtype in customer webhooks and shows a fallback in the portal, but cannot store or play the video file until Meta exposes it through Cloud API.

Humanized text is still saved and delivered as a normal Easyhook text message. It only changes the pre-send behavior:

1. Easyhook finds the latest inbound message from `to`, unless `message_id` is provided.
2. Easyhook attempts to mark the conversation as read when the provider supports it.
3. Easyhook waits a short estimated reading delay.
4. Easyhook attempts to show the provider's typing indicator.
5. Easyhook waits a short estimated typing delay.
6. Easyhook sends the text message.

Messenger and Instagram use their sender actions, Telegram uses its typing action, and WhatsApp uses read and typing indicators. These presence controls are best-effort: if the provider rejects one, Easyhook still sends the text and reports the result in `controls.read` and `controls.typing` as `sent`, `failed`, or `skipped`.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/humanized-text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Thanks, I just checked it and we can help with that."
  }'
```

Optional explicit `message_id`:

```json
{
  "from": "15550100002",
  "to": "15550100003",
  "body": "Thanks, I just checked it and we can help with that.",
  "message_id": "wamid.HBg..."
}
```

If no recent inbound message exists, Easyhook returns:

```json
{
  "error": "latest_inbound_message_not_found",
  "hint": "Send message_id explicitly or wait until Easyhook receives an inbound message from this recipient."
}
```



## Deprecated Multichannel Text Alias

Endpoint:

```http
POST /v1/messages/channel/text
```

This endpoint remains only for backward compatibility and returns
`Deprecation: true`. Use `/v1/messages/text` and, only when necessary, the
explicit `channel` discriminator.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned provider `account.id`. Legacy aliases and usernames remain accepted. |
| `to` | string | Provider recipient id. Messenger uses PSID. Instagram uses IGSID. |
| `body` | string | Message text. |

Example Messenger send:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"123456789012346","to":"PSID_VALUE","body":"Hello from Easyhook"}'
```

Example Instagram send:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"17841400000000001","to":"IGSID_VALUE","body":"Hello from Easyhook"}'
```

Success response:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

Notes:

- `/v1/messages/text` now resolves both WhatsApp phones and connected Messenger/Instagram channels through `from`.
- Messenger and Instagram sends use Meta's normal messaging rules, including the customer response window.
- WhatsApp templates remain WhatsApp-only.

## Send Multichannel Media

Endpoint:

```http
POST /v1/messages/channel/media
```

Requires `messages:write`. Supports Messenger and Instagram media sends. `/v1/messages/media` is the preferred standardized endpoint for channel media by `id` or `link`.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned channel alias, Page id alias, handle, Instagram id alias, Instagram username, or connected channel id. |
| `to` | string | Provider recipient id. Messenger uses PSID. Instagram uses IGSID. |
| `type` | string | `image`, `video`, `audio`, or `file`. `document` is normalized to `file`. |
| `id` or `link` | string | Existing provider attachment id or public HTTPS media URL. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `filename` | string | Filename for file/document attachments. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support-messenger",
    "to": "PSID_VALUE",
    "type": "image",
    "link": "https://example.com/promo.png"
  }'
```

### Upload And Send Channel Media

Endpoint:

```http
POST /v1/messages/channel/media/upload
```

Requires `messages:write`. Easyhook stores the file temporarily, creates a short-lived URL, sends it to Messenger or Instagram, and returns the local `media_asset_id`.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned Messenger or Instagram channel alias/id. |
| `to` | string | Messenger PSID or Instagram IGSID. |
| `type` | string | `image`, `video`, `audio`, or `file`. |
| `file_name` | string | Original filename. |
| `file_type` | string | MIME type. |
| `file_base64` | string | Base64 encoded file bytes. |

Example:

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/messages/channel/media/upload \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"support-messenger\",
    \"to\": \"PSID_VALUE\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

## Upload Reusable Media

Endpoint:

```http
POST /v1/media
```

Uploads private Easyhook-managed media for the organization that owns the API
key. This media is reusable, does not expire, and is addressed by a unique
`name` within the organization. Compatible connected channels can reuse the
same asset without uploading it again.

Each organization includes `1 GB` of active reusable media storage. Reusable
media over that included quota is billed monthly at `3 MXN / GB / month`.
Uploading reusable media does not expire and does not block at `1 GB`; the
upload response includes the current organization usage estimate when
available:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook"
  },
  "storage": {
    "included_bytes": 1073741824,
    "used_bytes": 143211,
    "overage_price_mxn_per_gb": 3,
    "billed_monthly": true
  }
}
```

Requires `media:write`.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Unique media name for this organization. Use lowercase letters, numbers, `_`, `.`, or `-`. |
| `type` | string | `image`, `video`, `audio`, `document`, or `sticker`. |
| `file_name` | string | Original filename. |
| `file_type` | string | MIME type. |
| `file_base64` | string | Base64 encoded file bytes. |

Supported upload limits:

| Type | Accepted MIME types | Max size |
| --- | --- | --- |
| `image` | `image/jpeg`, `image/png`, `image/webp` | 5 MB |
| `sticker` | `image/webp` | 5 MB |
| `video` | `video/mp4`, `video/3gpp` | 25 MB |
| `audio` | Any `audio/*` MIME type | 25 MB |
| `document` | Any document MIME type | 25 MB |

Example:

```bash
FILE_BASE64="$(base64 -w 0 ./logo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"logo_easyhook\",
    \"type\": \"image\",
    \"file_name\": \"logo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

Success response:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook",
    "channel": "whatsapp",
    "type": "image",
    "mime_type": "image/png",
    "file_name": "logo.png",
    "size_bytes": 143211,
    "sha256": "abc...",
    "retention_policy": "permanent",
    "expires_at": null,
    "download_url": "https://api.easyhook.dev/v1/media/media_asset_uuid/download"
  }
}
```

## List Reusable Media

Endpoint:

```http
GET /v1/media
```

Requires `media:read`. Returns the reusable media library for the API-key
organization. Each item includes `download_url`, which can be fetched with the
same API key.

Example:

```bash
curl -X GET "https://api.easyhook.dev/v1/media" \
  -H "Authorization: Bearer eh_live_xxx"
```

## Download Reusable Media

Endpoint:

```http
GET /v1/media/{media_asset_id}/download
```

Requires `media:read`. Streams the stored bytes from Easyhook storage. This request does not call Meta and is intended for customer-built inboxes or CRMs that need to render media from Easyhook. Downloads are logged in `media_access_logs` for transfer metering. Each tenant includes `10 GB/month` of media transfer; additional transfer is billed monthly at `3 MXN/GB`.

Example:

```bash
curl -L "https://api.easyhook.dev/v1/media/media_asset_uuid/download" \
  -H "Authorization: Bearer eh_live_xxx" \
  --output logo.png
```

The same authenticated download pattern applies to private URLs delivered in
incoming webhooks:

```bash
curl -L "$EASYHOOK_MEDIA_URL" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  --output inbound-media
```

Do not expose the API key in browser HTML. Download through a trusted backend,
n8n credential, or server-side worker. A bare browser request to the URL is
expected to fail because incoming customer media is private.

## Delete Reusable Media

Endpoint:

```http
DELETE /v1/media/{media_asset_id}
```

Requires `media:write`. Deletes the stored object and marks the media asset as deleted so its name can be reused for the same WABA.

Example:

```bash
curl -X DELETE https://api.easyhook.dev/v1/media/media_asset_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

## Send Reusable Media By Name

Endpoint:

```http
POST /v1/messages/media
```

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned WhatsApp `account.id` (Meta Phone Number ID) or business phone number. |
| `to` | string | Recipient WhatsApp number. |
| `type` | string | Media type: `image`, `video`, `audio`, `document`, or `sticker`. |
| `media_name`, `id`, or `link` | string | Easyhook reusable media name, Meta media id, or public media URL. Exactly one is required. |

Required fields for Messenger, Instagram, and Telegram:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned provider `account.id`. |
| `to` | string | Messenger PSID, Instagram IGSID, or Telegram chat ID. |
| `type` | string | `image`, `video`, `audio`, or `file`. `document` is normalized to `file` where required. |
| `media_name`, `id`, or `link` | string | Organization reusable media name, existing provider attachment id, or public HTTPS media URL. |

Optional fields:

| Field | Applies to | Description |
| --- | --- | --- |
| `caption` | `image`, `video`, `document` | Caption sent with media. |
| `filename` | `document` | Document filename shown to the recipient. |
| `at` | all types | ISO 8601 date/time for scheduled delivery. |
| `phone_id` | all types | Legacy Easyhook phone row id. Prefer `from`. |

Notes:

- WhatsApp media messages are session messages and require an open 24-hour customer service window.
- Stickers and audio do not support captions.
- WhatsApp stickers must be valid WebP files measuring exactly 512 x 512 px. Easyhook rejects reusable stickers with `invalid_sticker_dimensions` before sending or charging the send operation. The error includes both `dimensions` and `expected_dimensions`.
- Prefer Easyhook-managed reusable media for repeated sends. Session media can still use `id` or `link`.
- When `media_name` is used, Easyhook creates a short-lived signed URL internally and sends that URL to Meta. Customer applications only need to know the stable `media_name`.
- `media_name` resolves an organization-wide reusable asset. The same name can
  be used from WhatsApp, Messenger, Instagram, or Telegram when that provider
  supports the selected media type.

Example using a link:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","link":"https://example.com/image.png","caption":"Imagen de prueba"}'
```

Example using reusable media:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","media_name":"promo_image","caption":"Promo"}'
```

## WhatsApp Flows

Flows are WABA-level assets. Easyhook stores Flow metadata per tenant and WABA, then sends published Flows as WhatsApp interactive messages.

Current scope:

- Sync/list Flow metadata from Meta.
- Create a basic Flow record in Meta when the WABA token allows it.
- Publish a local Flow by calling Meta.
- Send a published Flow inside the 24-hour customer service window.
- Store Flow submissions by `flow_token`.
- Deliver completed Flow submissions to customer webhooks as `flow.submitted`.
- Handle WhatsApp Flow data-exchange callbacks at `/v1/meta/whatsapp/flows/data`.

Production Flow data exchange requires `WHATSAPP_FLOW_PRIVATE_KEY` on the backend. The key can be a PEM value with escaped newlines or a base64-encoded PEM. When a Flow is created with `endpoint_uri`, Easyhook derives the matching public key and sends it to Meta as `public_key`; customers do not need to paste keys manually per Flow. Easyhook decrypts Meta's `encrypted_aes_key` / `encrypted_flow_data`, stores the submission, and returns an encrypted response.

For static Flows submitted through WhatsApp's normal message webhook, Easyhook parses `interactive.nfm_reply.response_json`, stores the submission, and emits the same `flow.submitted` customer webhook event. Customers do not need to parse Meta's `nfm_reply` payload themselves.

For customer API calls in this section, the WABA can be resolved with any one of:

| Field | Where | Description |
| --- | --- | --- |
| `from` | query/body | Tenant-owned WhatsApp business phone number. Preferred for customer integrations. |
| `phone_id` | query/body | Easyhook phone row id. |
| `waba_id` | query/body | Easyhook WABA row id. |

### Sync Flows

Endpoint:

```http
POST /v1/flows/sync
```

Requires `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

Success response:

```json
{ "ok": true, "count": 2 }
```

### List Flows

Endpoint:

```http
GET /v1/flows?from=15550100001
```

Requires `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Create Flow

Endpoint:

```http
POST /v1/flows
```

Requires `flows:write`.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `waba_id`, `phone_id`, or `from` | string | WABA resolver. Prefer `from` for customer integrations. |
| `name` | string | Flow name in Meta. |
| `categories` | string[] | Meta Flow categories. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `flow_json` | object | Flow JSON definition, passed to Meta. |
| `endpoint_uri` | string | Data-exchange endpoint URI when the Flow needs backend callbacks. |

```bash
curl -X POST https://api.easyhook.dev/v1/flows \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "communication_preferences",
    "categories": ["SIGN_UP"],
    "flow_json": {
      "version": "7.1",
      "screens": []
    }
  }'
```

### Publish Flow

Endpoint:

```http
POST /v1/flows/{local_flow_id}/publish
```

Requires `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/local_flow_uuid/publish \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

### Delete Flow

Endpoint:

```http
DELETE /v1/flows/{local_flow_id}
```

Requires `flows:write`. Deletes the Flow in Meta and removes the local Easyhook Flow record. The WABA can be passed in the query string or JSON body.

```bash
curl -X DELETE "https://api.easyhook.dev/v1/flows/local_flow_uuid?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Send Flow Message

Endpoint:

```http
POST /v1/messages/flow
```

Requires `messages:write`. Flow messages are interactive session messages and require an open 24-hour customer service window.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned WhatsApp business phone number. |
| `to` | string | Recipient WhatsApp number. |
| `flow_id`, `flow_name`, or `flow_local_id` | string | Flow reference. |
| `body` | string | Message body shown above the CTA. |
| `cta` | string | Flow button text. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `flow_token` | string | Your correlation token. Easyhook generates one if omitted. |
| `flow_action` | string | Defaults to `navigate`. |
| `flow_action_payload` | object | Payload passed to the Flow action. |
| `header` | object | Optional Meta interactive header object. |
| `footer` | string | Optional footer text. |

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "flow_name": "communication_preferences",
    "body": "Manage your communication preferences.",
    "cta": "Open preferences",
    "flow_token": "contact_123_preferences"
  }'
```

### List Flow Submissions

Endpoint:

```http
GET /v1/flows/{local_flow_id}/submissions?from=15550100001
```

Requires `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows/local_flow_uuid/submissions?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

Success response:

```json
{
  "submissions": [
    {
      "id": "submission_uuid",
      "flow_token": "contact_123_preferences",
      "contact_wa_id": "15550100002",
      "action": "complete",
      "screen": "OPT_IN",
      "data": { "service_opt_in": true },
      "created_at": "2026-07-02T20:00:00.000Z"
    }
  ]
}
```

### Flow Submission Webhooks

To receive Flow responses in real time, create a customer webhook subscribed to:

```json
{
  "scope": { "type": "organization" },
  "events": ["flow.submission.*"],
  "providers": ["whatsapp"]
}
```

Use `scope: { "type": "phone", "from": "15550100002" }` when only one WhatsApp number should receive the callback, or use `type: "waba"` with the same `from` number for every connected number in that WABA. Messenger and Instagram use `type: "channel"` with a channel alias. Meta Business Portfolio IDs are not public scopes.

Easyhook sends `flow.submitted` after the submission is stored. The payload includes the `flow.token` used when sending the Flow, the Flow identifiers, the WhatsApp contact, and the submitted `flow.data`.

If the submitted `data` contains `service_opt_in`, `marketing_opt_in`, `service_opt_out`, or `marketing_opt_out` as `true`, Easyhook also updates the contact consent state and stores an audit event with the Flow submission as evidence.

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100002"
  },
  "flow": {
    "submission_id": "submission_uuid",
    "name": "easyhook_consent_preferences_opt_in",
    "token": "contact_123_preferences",
    "action": "complete",
    "data": {
      "service_opt_in": true
    }
  }
}
```

### Flow Data Exchange Endpoint

Configure dynamic WhatsApp Flows to call:

```http
POST /v1/meta/whatsapp/flows/data
```

This endpoint is called by Meta, not by customer API clients. Easyhook resolves the `flow_token` generated or supplied when `/v1/messages/flow` was sent, then stores the submitted `data`.

## Meta And Portal Endpoints

These endpoints are part of Easyhook operations, onboarding, portal features, or backward compatibility. They are documented so integrators understand what they may see in logs, but they are not the preferred surface for new customer API integrations.

### Meta Webhook Ingestion

Called by Meta only:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/v1/meta/whatsapp/webhook` | Meta webhook verification for WhatsApp. |
| `POST` | `/v1/meta/whatsapp/webhook` | Receives WhatsApp Cloud API, coexistence, template, status, and Flow webhook payloads. |
| `GET` | `/v1/meta/messaging/webhook` | Meta webhook verification for Messenger/Instagram Messaging. |
| `POST` | `/v1/meta/messaging/webhook` | Receives Messenger and Instagram Messaging webhook payloads. |
| `POST` | `/v1/meta/whatsapp/flows/data` | Receives encrypted WhatsApp Flow data-exchange callbacks. |

Customers do not call these endpoints directly. Customer systems receive normalized events through customer webhooks.

### Portal/Admin Operations

These require the Easyhook admin token and are used by the portal or operations:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/v1/api-keys` | Create a tenant API key. |
| `GET` | `/v1/api-keys?tenant_id=...` | List tenant API keys. |
| `POST` | `/v1/api-keys/{key_id}/revoke` | Revoke a tenant API key. |
| `GET` | `/v1/hooks?tenant_id=...` | List customer webhooks. |
| `POST` | `/v1/hooks` | Create a customer webhook. |
| `POST` | `/v1/hooks/{hook_id}/pause` | Pause a customer webhook. |
| `DELETE` | `/v1/hooks/{hook_id}` | Delete a customer webhook. |
| `POST` | `/v1/hooks/{hook_id}/history-replays` | Re-send stored coexistence messages or contacts to an active hook in batches. |
| `GET` | `/v1/hooks/{hook_id}/history-replays/{replay_id}?tenant_id=...` | Read replay progress. |
| `POST` | `/v1/channels/messenger/connect` | Connect a Facebook Page/Messenger channel from a Meta OAuth code. |
| `POST` | `/v1/meta/whatsapp/signup/complete` | Complete WhatsApp embedded signup. |
| `POST` | `/v1/meta/whatsapp/connections/adopt` | Adopt an existing WhatsApp connection into a tenant. |
| `POST` | `/v1/meta/whatsapp/phones/sync` | Sync WhatsApp phone metadata from Meta. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync` | Request WhatsApp Business App coexistence history/state sync. |
| `GET` | `/v1/meta/whatsapp/phones/coexistence-sync/status?tenant_id=...&phone_id=...` | Read the latest coexistence synchronization state for the portal. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync/resume` | Resume persisted failed jobs from a partial/failed synchronization without reconnecting the phone. |
| `POST` | `/v1/meta/whatsapp/phones/register` | Register a provisioned WhatsApp phone with a six-digit PIN. Do not use for an already working coexistence number. |
| `GET` | `/v1/integrations/chatwoot?tenant_id=...` | List portal-managed Chatwoot integrations. |
| `POST` | `/v1/integrations/chatwoot` | Provision a Chatwoot API Inbox and its scoped Easyhook subscription. |
| `DELETE` | `/v1/integrations/chatwoot/{integration_id}` | Disconnect Chatwoot without deleting its existing inbox/history. |
| `GET` | `/v1/integrations/chatwoot/{integration_id}/imports?tenant_id=...` | Read contact/history import progress. |
| `POST` | `/v1/integrations/chatwoot/{integration_id}/imports` | Start a `contacts` or `history` import. |
| `POST` | `/v1/wallet/topups/stripe/checkout` | Create a Stripe-hosted checkout for an MXN or USD wallet recharge. Internal/admin route. |
| `POST` | `/v1/billing/stripe/webhook` | Receive signed Stripe Checkout events and credit the corresponding organization wallet. Called by Stripe only. |

Admin API key parameters:

| Endpoint | Required | Optional |
| --- | --- | --- |
| `POST /v1/api-keys` | `tenant_id`, `name` | `environment` (`test` or `live`, defaults to `test`), `scopes` string array. If omitted, Easyhook grants the default customer scopes. |
| `GET /v1/api-keys` | query `tenant_id` | none |
| `POST /v1/api-keys/{key_id}/revoke` | path `key_id`, body `tenant_id` | none |

Chatwoot portal parameters:

| Endpoint | Required | Optional |
| --- | --- | --- |
| `GET /v1/integrations/chatwoot` | query `tenant_id` | none |
| `POST /v1/integrations/chatwoot` | `tenant_id`, `base_url`, numeric `account_id`, `api_token`, `channels` array with one or more `{ sender, provider }` objects | Per-channel `label`; legacy single-channel fields `sender`, `provider`, and `name` remain accepted |
| `DELETE /v1/integrations/chatwoot/{integration_id}` | path `integration_id`, body `tenant_id` | none |
| `GET /v1/integrations/chatwoot/{integration_id}/imports` | path `integration_id`, query `tenant_id` | none |
| `POST /v1/integrations/chatwoot/{integration_id}/imports` | path `integration_id`, `tenant_id`, `import_type` (`contacts` or `history`) | none |

The tokenized `/v1/integrations/chatwoot/events/...` and
`/v1/integrations/chatwoot/webhook/...` callbacks are generated and used
server-to-server by Easyhook and Chatwoot. Customers must not construct or call
them manually.

Customer webhook admin parameters are documented in [Customer Webhooks](/webhooks). In short, `POST /v1/hooks` accepts `tenant_id`, `name`, `url`, `events`, `providers`, `scope_type`, `scope_ref`, `auth_type`, and `auth_header_name`.

Webhook routing uses three separate filters:

- `providers` chooses the channel family: `whatsapp`, `messenger`, `instagram`, or `*`.
- `scope_type` chooses the asset level: `tenant` for the whole organization, `waba` or `phone` for WhatsApp, and `channel` for Messenger/Instagram.
- `events` chooses the event family, for example `message.*`, `status.*`, `template.*`, or `flow.submission.*`.
- Messenger and Instagram inbound messages can arrive as `message.text`, `message.image`, `message.video`, `message.audio`, or `message.file`. Subscribe to `message.*` for all supported message types, or to one concrete event if you only want a specific type.

Recommended style is to keep provider and event separate. For example, use `providers: ["messenger"]` with `events: ["message.*"]`, not a provider-prefixed event pattern. Provider-prefixed patterns remain backward-compatible but are not the preferred style for new integrations.

Meta onboarding/admin parameters:

| Endpoint | Required | Optional |
| --- | --- | --- |
| `POST /v1/channels/messenger/connect` | `tenant_id`, `code`, `redirect_uri` | `page_id` |
| `POST /v1/meta/whatsapp/signup/complete` | `tenant_id`, `code`, `redirect_uri` | `waba_id`, `business_id`, `phone_number_id`, `event`, `signup_mode`, `code_received_at`, `backend_post_started_at`, `client_started_at`, `dialog_redirect_uri`, `oauth_redirect_uri` |
| `POST /v1/meta/whatsapp/connections/adopt` | `tenant_id`, `access_token` | `waba_id`, `business_id`, `phone_number_id`, `request_coexistence_sync` |
| `POST /v1/meta/whatsapp/phones/sync` | `tenant_id`, `phone_id` | none |
| `POST /v1/meta/whatsapp/phones/coexistence-sync` | `tenant_id`, `phone_id` | `media_mode`: `metadata`, `recent_media`, or `all_recent_media` |
| `POST /v1/meta/whatsapp/phones/coexistence-sync/resume` | `tenant_id`, `phone_id` | `sync_id`; if omitted, Easyhook uses the latest session |
| `POST /v1/meta/whatsapp/phones/register` | `tenant_id`, `phone_id`, `pin` | `pin` must contain exactly six digits |

Stripe wallet routes are not authenticated with customer API keys. The portal verifies that the signed-in user owns or administers the organization, then calls the checkout route with the Easyhook admin token. The checkout accepts `tenant_id`, `amount_cents`, `currency`, optional `customer_email`, `success_url`, and `cancel_url`. MXN top-ups range from `$100` to `$5,000 MXN`; USD top-ups range from `$10` to `$500 USD`. Easyhook credits exactly the paid amount in the wallet's fixed currency and absorbs Stripe processing fees. The webhook verifies the raw request body with `Stripe-Signature` and `STRIPE_WEBHOOK_SECRET`, and only paid `checkout.session.completed` or `checkout.session.async_payment_succeeded` events can credit the wallet. Provider event and checkout IDs make repeated delivery idempotent.

### Legacy WhatsApp Route Aliases

These routes remain implemented for portal/backward compatibility but are not recommended for new integrations. Use the standardized `/v1/messages/*`, `/v1/templates*`, `/v1/flows*`, and `/v1/consent*` routes instead.

| Legacy route family | Preferred route family |
| --- | --- |
| `/v1/whatsapp/messages/text` | `/v1/messages/text` |
| `/v1/whatsapp/messages/template` | `/v1/messages/template` |
| `/v1/whatsapp/templates`, `/sync`, `/delete` | `/v1/templates`, `/sync`, `/delete` |
| `/v1/whatsapp/flows`, `/sync`, `/{id}/publish`, `/{id}`, `/{id}/submissions` | `/v1/flows` equivalents |
| `/v1/whatsapp/consent/config`, `/enable` | `/v1/consent/config`, `/enable` |

## List Templates For a Number

Endpoint:

```http
GET /v1/templates?from=15550100001
```

`from` is the tenant-owned WhatsApp business phone number. Easyhook resolves the WABA behind that number and returns only templates for that WABA. If the API key tenant does not own the number, the request returns `phone_not_found`.

### Sender And WABA Isolation

Template list, sync, create, media upload, and delete operations use the same strict resolver:

- The API key fixes the organization boundary.
- When `from` or `phone_id` is present, the sender's registered WABA is authoritative.
- Easyhook never falls back to another WABA when that sender cannot be resolved.
- If `waba_id` is also supplied, it must identify the same WABA as the sender.
- A sender/WABA conflict returns `409 sender_waba_mismatch` before Easyhook calls Meta.
- An unknown sender returns `404 phone_not_found`; it does not continue with `waba_id`.

Customer integrations should send only `from`. Supplying both selectors is useful for reconciliation, not
for overriding the WABA associated with a phone.

Example:

```bash
curl -X GET "https://api.easyhook.dev/v1/templates?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

`waba_id` is still accepted for legacy/internal usage, but customer integrations should prefer `from`.

The response always identifies the provider account explicitly:

```json
{
  "meta_waba_id": "123456789012345",
  "templates": [
    {
      "id": "easyhook-template-uuid",
      "template_id": "987654321098765",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "lang": "es_MX",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL"
    }
  ]
}
```

`meta_waba_id` is Meta's stable WABA identifier. A template's `waba_id`, when present for backward
compatibility, is Easyhook's internal UUID and must not be sent to Meta or used as the provider identifier.

## Sync Templates

Endpoint:

```http
POST /v1/templates/sync
```

Requires `templates:write`. Pulls templates from Meta for one WABA and stores the current status, quality, language, category, and components in Easyhook.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from`, `phone_id`, or `waba_id` | string | WABA resolver. Prefer `from` for customer integrations. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

The response includes the templates returned by Meta after their local status has been refreshed:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "count": 1,
  "templates": [
    {
      "id": "1234567890",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "language": "es_MX",
      "category": "UTILITY",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL",
      "components": []
    }
  ]
}
```

## Check Template Category

Endpoint:

```http
POST /v1/templates/classify
```

Requires `templates:write`. Send `category` and the intended `components`.
Easyhook returns fast, deterministic advice before submission:

```json
{
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "Aprovecha 20% de descuento hoy." }
  ]
}
```

When the content appears promotional, the response can recommend `MARKETING`
and include a warning. This check is advisory and never replaces Meta's final
classification.

## Create Template

Endpoint:

```http
POST /v1/templates
```

Requires `templates:write`. Creates a WhatsApp template in Meta and stores the
local copy. The response includes `category_advice`; warnings do not block
submission.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from`, `phone_id`, or `waba_id` | string | WABA resolver. Prefer `from` for customer integrations. |
| `name` | string | Template name. Use lowercase letters, numbers, and underscores. |
| `language` | string | Meta language code, for example `es_MX` or `en_US`. |
| `category` | string | Meta template category, for example `UTILITY`, `MARKETING`, or `AUTHENTICATION`. |
| `components` | array | Meta template component array. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `parameter_format` | string | `POSITIONAL` (default) or `NAMED`. Easyhook validates and forwards it to Meta. |
| `message_send_ttl_seconds` | number | Meta message send TTL for supported template categories. |

Send a stable `Idempotency-Key` header for retry-safe creation. Repeating the same key and JSON returns
the original result with `idempotent_replay: true` and does not call Meta again. Reusing a key with different
template data returns `409 idempotency_key_reused_with_different_request`. Keep the key at 255 characters or
fewer.

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/templates \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Idempotency-Key: template-order-ready-en-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "order_ready",
    "language": "en_US",
    "category": "UTILITY",
    "parameter_format": "NAMED",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{customer_name}}, your order is ready.",
        "example": {
          "body_text_named_params": [
            {
              "param_name": "customer_name",
              "example": "Example User"
            }
          ]
        }
      }
    ]
  }'
```

Response:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "template_id": "987654321098765",
  "status": "PENDING",
  "parameter_format": "NAMED"
}
```

### Upload Template Header Media

```http
POST /v1/templates/media
```

Requires `templates:write`. Easyhook uploads the file through Meta's resumable upload API and returns the
`handle` required in `components[].example.header_handle` when creating an image, video, or document
template.

Identify the WABA with `from`, `phone_id`, or `waba_id`. Supply exactly one source:

- `file_base64` together with `file_name` and `file_type`.
- `source_url`, containing a public HTTPS URL. Easyhook downloads and validates the file before uploading it
  to Meta. Private-network URLs, credentials in URLs, non-HTTPS URLs, and redirects to those destinations are
  rejected.

Use `source_url` for large files. Base64 increases the request size and is intended for smaller approval
assets.

To retain the approval example as the default send asset, also provide `template_name`,
`template_language`, and `media_type` (`image`, `video`, or `document`).

```bash
FILE_BASE64="$(base64 -w 0 ./promotion.jpg)"

curl -X POST https://api.easyhook.dev/v1/templates/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"template_name\": \"monthly_offer\",
    \"template_language\": \"es_MX\",
    \"media_type\": \"image\",
    \"file_name\": \"promotion.jpg\",
    \"file_type\": \"image/jpeg\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

The same operation using a URL:

```json
{
  "from": "15550100002",
  "source_url": "https://cdn.example.com/monthly-offer.mp4",
  "template_name": "monthly_offer_video",
  "template_language": "es_MX",
  "media_type": "video"
}
```

Use the returned handle in the creation components:

```json
{
  "type": "HEADER",
  "format": "IMAGE",
  "example": {
    "header_handle": ["4::meta-upload-handle"]
  }
}
```

Uploading again for the same WABA, template name, and language replaces the Easyhook default asset and
removes the previous private Storage object.

## Delete Template

Endpoint:

```http
POST /v1/templates/delete
```

Requires `templates:write`. Deletes a template in Meta and removes the local Easyhook record.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from`, `phone_id`, or `waba_id` | string | WABA resolver. Prefer `from` for customer integrations. |
| `template_id` | string | Easyhook local template row id. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/delete \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","template_id":"template_uuid"}'
```

## Send Template Message

Endpoint:

```http
POST /v1/messages/template
```

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned WhatsApp business phone number. |
| `to` | string | Recipient WhatsApp number. |
| `template` or `template_id` | object/string | Public template reference or legacy internal template row id. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `parameters` | object | Friendly variable format. Easyhook converts to Meta `components`. |
| `components` | array | Raw Meta template components. Overrides `parameters` when sent. |
| `media` | object | Dynamic header media. Use exactly one of `link`, `id`, or reusable media `name`; documents may include `filename`. |
| `at` | string | ISO 8601 date/time for scheduled delivery. |
| `phone_id` | string | Legacy Easyhook phone row id. Prefer `from`. |

Recommended template reference by name and language:

```json
{
  "template": {
    "name": "pedido_listo",
    "language": "es_MX"
  }
}
```

Name-only template reference is accepted only when the template name resolves to exactly one template in the WABA behind `from`:

```json
{
  "template": {
    "name": "welcome_template_test"
  }
}
```

Meta template id reference is also accepted:

```json
{
  "template": {
    "meta_template_id": "1234567890"
  }
}
```

Template variables:

Use `parameters.body` and `parameters.header` for text variables. Easyhook converts these into Meta template components.

Array form for positional variables:

```json
{
  "parameters": {
    "body": ["Example User", "12345"]
  }
}
```

Object form for named or numbered variables:

```json
{
  "parameters": {
    "body": {
      "1": "Example User",
      "order_id": "12345"
    }
  }
}
```

Manual Meta `components` can still be sent directly for advanced cases:

```json
{
  "components": [
    {
      "type": "body",
      "parameters": [{ "type": "text", "text": "Example User" }]
    }
  ]
}
```

### Default And Dynamic Header Media

For image, video, and document header templates, Easyhook uses this precedence:

1. A media header supplied in `components`.
2. The friendly `media` object.
3. The approval asset stored by Easyhook.

The media submitted for approval is a reusable default, not a restriction. It can be replaced independently
on every send.

Dynamic URL:

```json
{
  "from": "15550100002",
  "to": "13125550199",
  "template": { "name": "monthly_offer", "language": "es_MX" },
  "media": { "link": "https://cdn.example.com/customer-specific-offer.jpg" },
  "parameters": { "body": ["Example User"] }
}
```

Previously uploaded Meta media:

```json
{ "media": { "id": "123456789012345" } }
```

Reusable Easyhook media:

```json
{ "media": { "name": "july_catalog", "filename": "catalog-july.pdf" } }
```

Raw Meta document component:

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
            "filename": "invoice-123.pdf"
          }
        }
      ]
    }
  ]
}
```

The dynamic media type must match the approved header format. Easyhook rejects ambiguous references,
non-HTTPS links, media on templates without a media header, and image/video/document mismatches.

Scheduled templates preserve the selected media reference. Reusable media is resolved and signed when the
scheduled job executes, avoiding expired URLs.

After editing a template in Meta, call `POST /v1/templates/sync`. Easyhook upserts the current provider ID,
status, components, category, and quality for the same WABA/name/language. Do not send the edited definition
until the synchronized status returns to `APPROVED`.

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","template":{"name":"pedido_listo","language":"es_MX"},"parameters":{"body":["Example User"]}}'
```

Success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Easyhook Live Chat

Live Chat is an Easyhook-owned channel for browser applications. A frontend can
use it without operating a separate backend and without exposing a normal
Easyhook API key. Create and configure the widget in the portal, then copy the
publishable key (`eh_chat_pk_...`) into the website.

The publishable key only identifies one widget. It does not grant access to the
organization, Inbox, Supabase, other contacts, or other conversations. Configure
an exact origin allowlist and render Cloudflare Turnstile before bootstrapping a
visitor session.

Create a session:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key":"eh_chat_pk_xxx",
    "display_name":"Ada",
    "email":"ada@example.com",
    "turnstile_token":"TURNSTILE_RESPONSE"
  }'
```

Anonymous clients cannot choose `visitor_id`; Easyhook generates a fresh
`ehusr_...` identity so one browser cannot claim another visitor's history. The
response also includes `conversation_id` (`ehconv_...`), a 15-minute access
token and a rotating refresh token. Store the tokens only for this browser.

For a signed-in application user, the customer's backend first creates a
five-minute identity token with its Easyhook API key:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/identity-tokens \
  -H 'Authorization: Bearer eh_live_xxx' -H 'Content-Type: application/json' \
  -d '{"widget_id":"WIDGET_UUID","external_user_id":"usr_42","roles":["buyer"]}'
```

Pass the returned `identity_token` to session bootstrap. Roles are opaque
customer metadata; Easyhook enforces the signed identity, conversation
membership and allowed chat action, while the customer remains responsible for
its own business authorization rules.

Send a text message with a client-generated idempotency identifier:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/messages \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"body":"Necesito ayuda","client_message_id":"web_01JABCDEF"}'
```

Use the same endpoint with `type` equal to `image`, `video`, `audio`,
`document`, or `sticker` and provide `file_name`, `file_type`, and
`file_base64`. `reply_to` quotes another message and `forwarded_from` preserves
the original message identifier when the application forwards content.

Edits, deletes, reactions, reads and typing use an idempotent action:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/actions \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"action":"reaction","message_id":"lc_xxx","emoji":"❤️","client_action_id":"action_01JABCDEF"}'
```

Read new messages:

```bash
curl 'https://api.easyhook.dev/v1/live-chat/sessions/current/messages?after=2026-08-18T20:00:00.000Z&limit=50' \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx'
```

Rotate the session before the access token expires:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/refresh \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"eh_chat_refresh_xxx"}'
```

Refresh tokens are single-use. A successful refresh invalidates both previous
tokens and returns a new pair.

For application-owned direct conversations and groups, a trusted backend uses
`POST /v1/live-chat/app/conversations` with `widget_id`, `from`, `kind`,
`members`, and (for groups) `title`. Scoped clients list
`/sessions/current/conversations`, then read/send under
`/sessions/current/conversations/{ehconv_id}/messages` and use the sibling
`actions` and `state` endpoints. The server always infers `from` from the scoped
session; clients send to an `ehconv_...` conversation and cannot forge another
sender.

The server validates the session and its original origin on every request.
Bootstrap and session operations have independent sustained limits; rate-limit
responses are HTTP `429` with `Retry-After`. Invalid/expired sessions return
`401`, a mismatched origin returns `403`, and unavailable Turnstile verification
fails closed. Durable text/media, stickers, replies, forwarding metadata,
reactions, edits, deletion tombstones and per-member read cursors are enabled.
Typing is an expiring signal exposed through `state`; tenant agents also receive
it through the private Inbox Broadcast topic.

The installable `easyhook-chat.js` widget renders text and protected media,
stickers, replies, reactions, edits, deletion tombstones, read state and typing.
It uses the scoped session endpoints only; it never embeds an organization API
key or Supabase credential.

Inbound visitor messages use the normal `message.text` webhook envelope with
`channel: "live_chat"`, and appear in the multichannel Inbox. Live Chat sends
and durable actions use the wallet operation ledger with client idempotency
keys. Read/list polling is not billed, preventing duplicate charges from
refresh or reconnect behavior.

## Documentation Rule

When changing public API behavior, update this document before merging/deploying the change. At minimum, update:

- Endpoint path and method.
- Authentication/scopes if they change.
- Required and optional fields.
- Error behavior.
- Example request.
- Important compliance or Meta-policy constraints.
