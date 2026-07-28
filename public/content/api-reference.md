# Easyhook Public API

Last updated: 2026-07-27

This document is the source of truth for customer-facing API behavior. Every API change must update this file in the same change set.

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

Expected isolation errors:

| HTTP | Error | Meaning |
| --- | --- | --- |
| `400` | `tenant_id_not_allowed` | The customer request tried to override the organization from the API key. |
| `400` | `invalid_from` | The sender is not a valid supported identifier. |
| `404` | `phone_not_found` | The sender is missing from this organization, including when it belongs to another organization. |
| `404` | `waba_not_found` | The WABA is missing from this organization, including when it belongs to another organization. |
| `409` | `sender_phone_mismatch` | `from` and `phone_id` identify different owned phones. |
| `409` | `sender_waba_mismatch` | The selected sender does not belong to the supplied WABA. |

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
  --env EASYHOOK_FROM=5218661479075 \
  --env EASYHOOK_CONTACTS='[{"phone":"5215660069997","name":"Tram","description":"QA contact; use only for requested tests"}]' \
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
EASYHOOK_FROM = "5218661479075"
EASYHOOK_CONTACTS = "[{\"phone\":\"5215660069997\",\"name\":\"Tram\",\"description\":\"QA contact; use only for requested tests\"}]"
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

### Behavior

- Live inbound text and media create or reuse a Chatwoot contact and
  conversation.
- Public outgoing agent messages are sent through the connected Easyhook
  sender.
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
| API Base URL | `https://api.easyhook.dev` |

The credential test calls `GET /v1/me`, so it only verifies that the API key is valid and can identify the organization.

Available nodes:

| Node | Purpose |
| --- | --- |
| `Easyhook` | Sends messages, sends templates, sends WhatsApp Flows, uploads/list/deletes reusable media, syncs/lists templates, and cancels scheduled messages. |
| `Easyhook Trigger` | Receives Easyhook webhook deliveries. Workflow activation registers the n8n Production URL automatically through `/v1/webhooks`. |

Main `Easyhook` operations:

| Resource | Operation | API endpoint used |
| --- | --- | --- |
| Message | Send Text | `POST /v1/messages/text` |
| Message | Send Text + Humanized Delivery | `POST /v1/messages/humanized-text` |
| Message | Send Read Receipt | `POST /v1/messages/read` |
| Message | Reply to WhatsApp Message | `POST /v1/messages/reply` |
| Message | Send Typing Indicator | `POST /v1/messages/typing` |
| Message | Send Media | `POST /v1/messages/media` |
| Message | Send Template | `POST /v1/messages/template` |
| Message | Send Flow | `POST /v1/messages/flow` |
| Media | Upload | `POST /v1/media` |
| Media | List | `GET /v1/media?from=...` |
| Media | Delete | `DELETE /v1/media/{id}` |
| Template | List | `GET /v1/templates?from=...` |
| Template | Sync From Meta | `POST /v1/templates/sync` |
| Scheduled Message | Get | `GET /v1/scheduled-messages/{id}` |
| Scheduled Message | Cancel | `DELETE /v1/scheduled-messages/{id}` |

Template sending in n8n defaults to manual entry because it is the most reliable path across self-hosted n8n environments:

1. Choose `Resource: Message`.
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

For a WhatsApp Business App history import, choose `Provider: WhatsApp` and `Event: Coexistence history (history.*)`, then select the organization, WABA, or number scope and activate the workflow **before** connecting the coexistence phone or requesting synchronization. `message.*` does not include historical imports. Easyhook sends batches of at most 100 events; the n8n trigger expands each batch into one output item per normalized event.

For WhatsApp, Easyhook exposes one consistent hierarchy in the portal, API webhooks, and n8n: **Organization → WABA → Number**. Meta Business Portfolios remain internal onboarding metadata. Templates, Flows, reusable media, and consent configuration belong to a WABA; conversations and customer-service windows belong to a number; contacts and consent evidence are isolated between WABAs.

Do not send `tenant_id` to public endpoints. Easyhook resolves the tenant from the API key. If a request includes `tenant_id`, the API returns:

```json
{ "error": "tenant_id_not_allowed" }
```

## Wallet And Billing

Easyhook is usage-based. There is no monthly plan requirement and no per-number fee in V1.

Wallets are scoped by organization/tenant. Each organization has its own balance, billing currency, usage ledger, top-ups, API charges, and media overage charges. If the same customer creates multiple organizations, each organization is funded separately. The billing currency is fixed by the first funded top-up and cannot be mixed while the wallet has balance or paid history.

Customers pay Meta directly for WhatsApp template fees. The Easyhook wallet only pays for Easyhook platform usage.

Billable in V1:

| Usage | Fee |
| --- | --- |
| Public customer API call that executes a supported operation | `0.01 MXN` or `0.001 USD` |
| Media transfer beyond included quota | `3 MXN / GB` or `0.20 USD / GB` |
| Reusable media storage beyond included quota | `3 MXN / GB / month` or `0.20 USD / GB / month` |
| Received chat media storage beyond included quota | `3 MXN / GB / month` or `0.20 USD / GB / month` |

Not billable:

- Portal/admin actions, including Inbox, template management, Flow management, consent setup, logs, connection sync, and manual testing from the portal.
- Meta webhooks used internally to update Easyhook state.
- Incoming messages and every Easyhook delivery to customer webhook subscriptions, including message, status, template, Flow, onboarding, account, and contact events.
- Meta template/message charges. Those stay between the customer and Meta.
- Media storage upload itself.

Included media quotas in V1:

| Quota | Included |
| --- | --- |
| Media transfer | `10 GB / month / tenant` |
| Reusable media storage | `1 GB / WABA` |
| Received chat media storage | `100 GB / tenant` |
| Received chat media retention | `6 months` |

Media transfer includes customer API downloads and Easyhook-hosted reusable media served to Meta when a customer sends by `media_name`. Received chat media is stored for up to `6 months`; storage is included until the tenant has more than `100 GB` of active received media. Reusable media does not expire; storage is included up to `1 GB` per WABA. Template media is managed separately.

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

Manual MXN top-ups can be done per organization/tenant by an Easyhook admin in Supabase using the audited SQL function:

```sql
select public.easyhook_credit_wallet(
  'TENANT_UUID',
  50000,
  'manual-topup-2026-07-07-transfer-001',
  '500.00 MXN bank transfer'
);
```

`p_amount_cents` is MXN cents, so `50000` means `500.00 MXN`.

## Endpoint Index

Recommended customer API endpoints:

| Method | Endpoint | Scope | Use |
| --- | --- | --- | --- |
| `GET` | `/v1/me` | any valid key | Validate an API key and inspect its tenant/scopes. Useful for n8n credential tests. |
| `GET` | `/v1/conversations?from=...` | `messages:read` | List recent WhatsApp conversations for one tenant-owned sender. Existing `messages:write` keys remain compatible. |
| `GET` | `/v1/conversations/{contact}/messages?from=...` | `messages:read` | Read recent inbound and outbound WhatsApp messages with one contact. Existing `messages:write` keys remain compatible. |
| `GET` | `/v1/conversations/{contact}/messages/wait?from=...` | `messages:read` | Wait for the next inbound WhatsApp message from one contact. Intended for bounded MCP/agent conversations. |
| `POST` | `/v1/messages/send` | `messages:write` | Forward-compatible unified text send endpoint. `from` can be WhatsApp, Messenger, or Instagram. |
| `POST` | `/v1/messages/text` | `messages:write` | Send text. `from` decides WhatsApp, Messenger, Instagram, or Telegram. WhatsApp supports scheduled `at`. |
| `POST` | `/v1/messages/email` | `messages:write` | Send or reply through Gmail, Outlook, or a connected IMAP/SMTP account. |
| `POST` | `/v1/messages/humanized-text` | `messages:write` | Send WhatsApp text after read, human-like delay, typing indicator, and reply. |
| `POST` | `/v1/messages/read` | `messages:write` | Mark an inbound WhatsApp message as read. |
| `POST` | `/v1/messages/reply` | `messages:write` | Send a contextual WhatsApp text reply using the original `message_id`. |
| `POST` | `/v1/messages/typing` | `messages:write` | Show WhatsApp typing indicator for an inbound message. |
| `POST` | `/v1/messages/media` | `messages:write` | Send media. WhatsApp supports `media_name`, Meta media `id`, public `link`, and scheduled `at`; Messenger/Instagram support `id` or public `link`. |
| `POST` | `/v1/messages/template` | `messages:write` | Send or schedule approved WhatsApp templates. |
| `POST` | `/v1/messages/flow` | `messages:write` | Send a published WhatsApp Flow inside the 24-hour window. |
| `GET` | `/v1/scheduled-messages/{id}` | `messages:read` | Reconcile a scheduled message, its WAMID, execution failure, and latest Meta status. Existing `messages:write` keys remain compatible. |
| `DELETE` | `/v1/scheduled-messages/{id}` | `messages:write` | Cancel a scheduled message that has not started processing. |
| `POST` | `/v1/media` | `media:write` | Upload permanent reusable WhatsApp media for the WABA behind `from`. |
| `GET` | `/v1/media?from=...` | `media:read` | List reusable WhatsApp media for a WABA. |
| `GET` | `/v1/media/{id}/download` | `media:read` | Download Easyhook-hosted media bytes for customer CRMs/inboxes. |
| `DELETE` | `/v1/media/{id}` | `media:write` | Delete reusable media. |
| `GET` | `/v1/templates?from=...` | `templates:read` | List WhatsApp templates for the WABA behind `from`. |
| `POST` | `/v1/templates/sync` | `templates:write` | Sync templates from Meta into Easyhook. |
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
| `POST` | `/v1/onboarding/sessions` | `onboarding:write` | Create a hosted WhatsApp onboarding session owned by the API key tenant. |
| `POST` | `/v1/onboarding/sessions/send` | `onboarding:write` | Create an onboarding session and send its URL from an authorized WhatsApp number. |
| `POST` | `/v1/messages/reaction` | `messages:write` | Add or remove a reaction on a WhatsApp message. |
| `GET` | `/v1/webhooks` | any valid key | List webhook subscriptions owned by the API-key organization. |
| `GET` | `/v1/webhooks/options?provider=...&scope_type=...` | any valid key | Discover compatible providers, event filters, scopes, and public sender identifiers. |
| `POST` | `/v1/webhooks` | any valid key | Create a webhook subscription; its HMAC/auth secret is returned once. |
| `GET` | `/v1/webhooks/{id}` | any valid key | Read one owned webhook subscription without exposing its secret. |
| `DELETE` | `/v1/webhooks/{id}` | any valid key | Remove an owned webhook subscription. |
| `POST` | `/v1/webhooks/{id}/replay` | any valid key | Retry failed delivery batches, optionally filtered by `sync_id`. |
| `POST` | `/v1/webhooks/{id}/history-replays` | any valid key | Re-send stored messages or contacts for `phone_id` using `replay_type`. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | any valid key | Read persistent History replay progress. |
| `POST` | `/v1/messages/channel/text` | `messages:write` | Send Messenger, Instagram, or Telegram text through a connected channel. |
| `POST` | `/v1/messages/channel/media` | `messages:write` | Send Messenger, Instagram, or Telegram media by existing attachment id or public link. |
| `POST` | `/v1/messages/channel/media/upload` | `messages:write` | Upload media to Easyhook temporarily and send it through Messenger or Instagram. |

Portal/admin endpoints exist for onboarding, API-key management, webhook management, and Meta webhook ingestion. They are listed near the end of this document so customers can recognize them, but new product integrations should use the recommended endpoints above.

Use `POST /v1/messages/reaction` with `from`, `to`, `message_id`, and `emoji`. An empty `emoji` removes the current reaction.

## Email: Gmail, Outlook, And IMAP/SMTP

Email is represented as a normal Easyhook channel. The organization API key
selects the organization and `from` must be the exact connected address.
Incoming email is stored in the shared Inbox and delivered through customer
webhooks as `message.received`. Gmail, Outlook, and generic IMAP/SMTP accounts
share the same public send contract.

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

Reply inside an existing thread using only the normalized `message.id` received
in the inbound webhook:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Re: Seguimiento",
  "body": "Gracias por confirmar.",
  "reply_to_message_id": "provider-message-id"
}
```

`reply_to_message_id` is recommended. For Outlook it performs a native
Microsoft Graph reply. For Gmail, Easyhook resolves the original Gmail message
and preserves its thread and RFC headers. For IMAP/SMTP, it is treated as the
original RFC Message-ID.

Most integrations should not send `thread_id`, `in_reply_to`, or `references`.
They remain available only for advanced direct-API reconciliation when the
caller already owns those provider values.

Request fields:

| Field | Required | Description |
| --- | --- | --- |
| `from` | yes | Exact connected email address owned by the API-key organization. |
| `to` | yes | Recipient email address. |
| `subject` | yes for a new message | Subject. Replies may reuse or provide `Re:` subject text. |
| `body` | yes unless `html` is present | Plain-text body and HTML fallback. |
| `html` | no | HTML body. It is sent as multipart when `body` is also present. |
| `reply_to_message_id` | no | Provider message ID from the inbound event. Preferred reply selector. |
| `thread_id` | no | Advanced: provider thread ID when `reply_to_message_id` cannot be used. |
| `in_reply_to` | no | Advanced: RFC Message-ID of the parent. |
| `references` | no | Advanced: RFC references chain. |
| `attachments` | no | Up to 10 files and 20 MB decoded total. Supports JPEG, PNG, WebP, MP4, 3GPP, AAC, M4A, MP3, AMR, OGG, PDF, plain text, Word, Excel, and PowerPoint. Each item uses `filename`, `content_type`, and base64 `content_base64`. |

Example with attachments:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@example.net",
  "subject": "Documentos",
  "body": "Adjuntamos los archivos solicitados.",
  "attachments": [
    {
      "filename": "reporte.pdf",
      "content_type": "application/pdf",
      "content_base64": "JVBERi0xLjc..."
    }
  ]
}
```

### Forward, Message State, And Drafts

Forward an existing email while preserving its original content and
attachments:

```http
POST /v1/messages/email/forward
```

```json
{
  "from": "soporte@example.com",
  "to": "equipo@example.com",
  "message_id": "provider-message-id",
  "note": "¿Puedes revisar este caso?"
}
```

Mark an email as read, unread, or archived:

```http
POST /v1/email/actions
```

```json
{
  "from": "soporte@example.com",
  "message_id": "provider-message-id",
  "action": "mark_read"
}
```

Valid actions are `mark_read`, `mark_unread`, and `archive`.

Drafts use the same normalized content and attachment fields:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/v1/email/drafts` | Create a draft. |
| `PUT` | `/v1/email/drafts/{draft_id}` | Replace a draft. |
| `POST` | `/v1/email/drafts/{draft_id}/send` | Send a draft; body only requires `from`. |

All routes resolve the provider from `from`. The API key must own that exact
connected address; otherwise Easyhook returns `email_channel_not_found`.

The normalized email message fields are:

| Field | Description |
| --- | --- |
| `message.text` | Plain-text body or a safe text fallback derived from HTML. |
| `message.subject` | Email subject. |
| `message.html` | Original HTML body when present. Treat it as untrusted content. |
| `message.thread_id` | Provider thread ID used for replies. |
| `message.message_id_header` | RFC Message-ID used by `in_reply_to`. |
| `message.in_reply_to` | RFC reply header from the received message. |
| `message.references` | RFC references chain. |
| `message.attachments` | Stored attachment metadata: `media_asset_id`, `filename`, `content_type`, and `size`. Download through the authenticated Easyhook media route. |
| `message.is_read` | Current read state when the provider exposes it. |
| `message.label_ids` | Gmail labels used for category, unread, starred, and important filters. |
| `message.inference_classification` | Outlook `focused` or `other` classification. |
| `message.flags` | IMAP flags such as `\Seen` and `\Flagged`. |

Customer API email sends are billed as one outbound operation. Incoming email
and webhook delivery are free. Sends made directly from the Easyhook portal
are not customer API operations and are not charged.

The WhatsApp 24-hour customer-service window does not apply to email or
Telegram. Gmail, Outlook, IMAP/SMTP, and Telegram sends are allowed at any
time permitted by their respective providers.

### Gmail

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

### Outlook

Outlook connects with Microsoft OAuth using `Mail.ReadWrite`, `Mail.Send`, and
basic identity scopes. Easyhook creates a Microsoft Graph change subscription,
validates its random `clientState`, queues each notification, and renews the
subscription before expiration. Disconnecting deletes the Graph subscription,
revokes the local grant, and removes the encrypted credential.

### Generic IMAP/SMTP

Generic email verifies IMAP receive access and SMTP send access before saving
the channel. TLS or STARTTLS is mandatory, certificate verification is enabled,
and private/reserved hosts are rejected after DNS resolution. Easyhook starts
from the current IMAP UID and polls every 60 seconds, so only messages received
after connection are imported. Disconnecting stops polling and deletes the
encrypted credentials.

Received HTML is untrusted input; sanitize it or render it in a sandboxed
document. Incoming attachments are stored privately and exposed only through
authenticated media downloads.

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

## Conversations And Recent Messages

Conversation reads are tenant-scoped by the API key and number-scoped by `from`. Public responses contain customer-visible phone numbers, provider message IDs, normalized message content, and delivery status. They do not expose tenant IDs, Supabase row IDs, token references, raw Meta payloads, or private storage URLs.

New API keys include `messages:read`. Keys created before this scope was introduced can use these endpoints when they already have `messages:write`.

### List conversations

```bash
curl "https://api.easyhook.dev/v1/conversations?from=5218661479075&limit=20" \
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
  "from": "5218661479075",
  "conversations": [
    {
      "contact": {
        "phone": "5215660069997",
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
curl "https://api.easyhook.dev/v1/conversations/5215660069997/messages?from=5218661479075&limit=50" \
  -H "Authorization: Bearer eh_live_xxx"
```

Messages are returned oldest to newest within each page, which lets an agent or inbox process them in conversational order.

```json
{
  "from": "5218661479075",
  "contact": "5215660069997",
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
curl "https://api.easyhook.dev/v1/conversations/5215660069997/messages/wait?from=5218661479075&after_id=wamid.example&timeout_seconds=60&limit=1" \
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
  "from": "5218661479075",
  "contact": "5215660069997",
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

## Hosted WhatsApp Onboarding

Use hosted onboarding when a developer wants their own customer to connect a WhatsApp Business account without giving that customer access to the Easyhook portal. The API key determines the owning organization; clients must not send `tenant_id`.

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
  "signup_mode": "cloud_api",
  "return_url": "https://app.example.com/settings/whatsapp",
  "language": "es",
  "metadata": {
    "external_customer_id": "cus_123"
  },
  "expires_in_seconds": 259200
}
```

Parameters:

| Field | Required | Meaning |
| --- | --- | --- |
| `signup_mode` | no | `cloud_api` for a regular WhatsApp Business API connection, or `coexistence` for WhatsApp Business App coexistence. Defaults to `cloud_api`. |
| `return_url` | no | HTTPS URL where the hosted page can send the customer after completion. |
| `language` | no | `es` or `en`. Defaults to `es`. |
| `metadata` | no | JSON object echoed back in onboarding webhooks. |
| `expires_in_seconds` | no | Lifetime from `300` to `3600` seconds. Defaults to one hour. |

Response:

```json
{
  "url": "https://www.easyhook.dev/connect/whatsapp/onboarding/onb_xxx",
  "session": {
    "id": "session_uuid",
    "status": "pending",
    "url": "https://www.easyhook.dev/connect/whatsapp/onboarding/onb_xxx",
    "organization": {
      "name": "appcreatorbr",
      "slug": "appcreatorbr"
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

When the customer completes Meta embedded signup on the hosted page, Easyhook stores the connected WABA and phone under the organization that owns the API key. Subscribe to `onboarding.*` webhooks to receive completion events in your app. Sessions expire after at most one hour and are consumed after the first successful completion.

The hosted Easyhook page uses these token-scoped support endpoints internally:

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/onboarding/sessions/{token}` | Public opaque session token | Read/open a non-expired hosted onboarding session. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | Public opaque session token | Exchange the Meta authorization code and complete the connection for the owning organization. |

Customer applications normally create a session and redirect the user to the returned Easyhook `url`; they should not recreate the hosted page's token completion flow.

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

## Phone Numbers

Use `from` as the customer-visible sender identifier. Do not use internal Supabase ids in customer integrations unless you are doing a portal/admin operation.

For WhatsApp, `from` is the business phone number:

```json
{ "from": "528661479075" }
```

For Messenger or Instagram, `from` is the channel alias/id configured by Easyhook:

```json
{ "from": "support-messenger" }
```

Instagram examples:

```json
{ "from": "benjamin_rdz" }
```

```json
{ "from": "ig_17841401731804358" }
```

Rules:

- Always include the international country calling code. Easyhook accepts
  E.164 (`+573001234567`) and digits-only (`573001234567`) values, plus common
  formatting with spaces, hyphens, dots, parentheses, or the `00`
  international prefix.
- Do not send national-only numbers. Easyhook does not guess a country because
  the same leading digits can identify a different valid country calling code.
- The `from` sender must belong to the tenant that owns the API key.
- Instagram usernames are passed without a leading `@`. Use `benjamin_rdz`, not `@benjamin_rdz`.
- A raw numeric Instagram Business Account id can be confused with a WhatsApp phone number. Use its generated `ig_<INSTAGRAM_ID>` alias instead.
- If the API key tenant does not own the number, Easyhook returns `phone_not_found`.
- Legacy `phone_id`, `waba_id`, and `channel_id` style inputs are still accepted where documented for internal/backward compatibility, but external customer examples should use `from`.
- Mexico: `+52 866 147 9075`, `528661479075`, `+52 1 866 147
  9075`, and `5218661479075` resolve to the same WhatsApp identity.
- Argentina: common mobile input such as `+54 11 15 2345 6789` is normalized
  to its international mobile identity (`5491123456789`).
- The same parser covers NANP countries and territories and the rest of Latin
  America; no country-specific default is applied.

Examples accepted for WhatsApp:

```json
{ "from": "+57 300 123 4567", "to": "00 54 9 11 2345-6789" }
```

```json
{ "from": "5511912345678", "to": "+56 9 8765 4321" }
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

## Consent: Opt-In / Opt-Out

For business-initiated template messages, Easyhook requires WABA consent to be enabled and the contact to have opt-in recorded in Easyhook. If the WABA is not enabled, Easyhook returns:

```json
{
  "error": "consent_not_enabled",
  "message": "Consent is not enabled for this WhatsApp Business Account.",
  "required_action": "enable_waba_consent"
}
```

If the WABA is enabled but the contact has not opted in, Easyhook returns:

```json
{ "error": "opt_in_required", "required_action": "send_consent_flow" }
```

Consent is configured per WABA. If WABA consent is not enabled, Easyhook still allows normal 24-hour session replies, but blocks business-initiated templates with `consent_not_enabled`.

If a contact is opted out, Easyhook blocks business-initiated template sends with `recipient_opted_out`. Free-form text, media, and Flow messages are still allowed when the contact has an open 24-hour customer service window, because the contact initiated that session.

Easyhook records consent automatically when a WhatsApp Flow submission includes these boolean fields:

| Field | Meaning |
| --- | --- |
| `service_opt_in` | Contact opted in to service/utility messages. |
| `marketing_opt_in` | Contact opted in to marketing messages. |
| `service_opt_out` | Contact opted out of service/utility messages. |
| `marketing_opt_out` | Contact opted out of marketing messages. |

Clear opt-out phrases such as `Ya no quiero recibir mensajes`, `Stop sending me messages`, `unsubscribe`, or the common typo `unsuscribe` do not immediately unsubscribe the contact. If WABA consent is active, Easyhook records `pending_opt_out` and sends the published opt-out WhatsApp Flow so the contact can confirm whether they want to stop service messages, marketing messages, or both.

### Enable WABA Consent

Endpoint:

```http
POST /v1/consent/enable
```

Requires `flows:write`.

This creates or reuses two default Flows for the WABA, publishes them, and marks WABA consent as active:

| Flow name | Purpose |
| --- | --- |
| `easyhook_consent_preferences_opt_in` | Collect service/utility and marketing opt-in. |
| `easyhook_consent_preferences_opt_out` | Confirm service/utility and marketing opt-out. |

The two Flows are separate Meta assets so the opt-in experience only shows opt-in choices, and the opt-out experience only shows opt-out choices.

```bash
curl -X POST https://api.easyhook.dev/v1/consent/enable \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "528661479075",
    "copy": {
      "business_name": "Acme Clinic"
    },
    "custom_keywords": ["cancel my reminders"]
  }'
```

### Get WABA Consent Config

```http
GET /v1/consent/config?from=528661479075
```

Requires `flows:read`. Also accepts `waba_id` or `phone_id` for legacy/admin usage.

### Update WABA Consent Config

```http
PATCH /v1/consent/config
```

Requires `flows:write`. Use this to customize copy and add customer-specific opt-out keywords. Fixed Easyhook opt-out keywords are still enforced.

```bash
curl -X PATCH https://api.easyhook.dev/v1/consent/config \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "528661479075",
    "copy": {
      "business_name": "Acme Clinic"
    },
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
    "from": "528661479075",
    "to": "5218661479075",
    "mode": "opt_in"
  }'
```

Allowed `mode` values: `opt_in`, `opt_out`.

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
    "from": "528661479075",
    "to": "5218661479075",
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
| `invalid_whatsapp_recipient` | The unified endpoint resolved WhatsApp, but `to` is not a valid WhatsApp phone number. |
| `phone_or_template_not_found` | The selected template could not be resolved for the WABA behind `from`. |
| `phone_or_flow_not_found` | The selected Flow could not be resolved for the WABA behind `from`. |
| `template_not_approved` | The template exists but is not approved by Meta. |
| `flow_not_published` | The Flow exists locally but is not published in Meta, so it cannot be sent. |
| `consent_not_enabled` | WABA consent has not been activated; enable it before sending business-initiated templates. |
| `opt_in_required` | Template send needs known opt-in recorded in Easyhook. |
| `recipient_opted_out` | Easyhook has the recipient marked as opted out, so business-initiated templates are blocked. |
| `customer_service_window_closed` | Free-form text/media is blocked outside the 24-hour window. If no matching contact or recent inbound event exists, the response includes `reason: "recipient_not_found_or_no_recent_inbound_message"`. |
| `scheduled_customer_service_window_closed` | Scheduled free-form text/media would be outside the 24-hour window at `at`; the response has `delivery_state: "not_sent"` and permits template fallback. |
| `scheduled_message_create_failed` | Easyhook could not persist or enqueue the schedule; inspect `retryable`, `delivery_state`, and `fallback_allowed` before retrying. |
| `scheduled_delivery_not_configured` | Scheduled delivery is not configured for this backend deployment. |
| `scheduled_message_not_cancellable` | The scheduled message is already processing, sent, failed, or cancelled. |
| `meta_send_failed` | Meta rejected the send request; response includes sanitized Meta details. |

## Send Message

Endpoint:

```http
POST /v1/messages/send
```

This is the forward-compatible unified send endpoint. It resolves `from` against the API key tenant.

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
  -d '{"from":"528661479075","to":"5218661479075","type":"text","body":"Hola desde Easyhook"}'
```

Success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Common Examples

Set these variables once:

```bash
export EASYHOOK_API_KEY="eh_live_xxx"
export EASYHOOK_FROM="528661479075"
export CUSTOMER_WA="5218661479075"
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
      \"body\": [\"Benjamin\"]
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
  "from": "528661479075",
  "to": "5218661479075",
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
| `from` | string | Tenant-owned WhatsApp business phone number or connected Messenger/Instagram channel alias. |
| `to` | string | WhatsApp recipient number, Messenger PSID, or Instagram IGSID. |
| `body` | string | Message text. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `at` | string | ISO 8601 date/time for scheduled WhatsApp delivery. Channel scheduling is not supported yet. |
| `phone_id` | string | Legacy Easyhook phone row id. Prefer `from`. |

Example:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"528661479075","to":"5218661479075","body":"Hola desde Easyhook"}'
```

WhatsApp success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

Messenger/Instagram success response:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

## Read, Typing, And Humanized Text

These endpoints are WhatsApp-only in V1 and use the connected phone behind `from`.

WhatsApp read receipts and typing indicators require an inbound WhatsApp message id (`wamid`).

Mark a message as read:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/read \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5218661479075",
    "message_id": "wamid.HBg..."
  }'
```

Show typing:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/typing \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5218661479075",
    "message_id": "wamid.HBg..."
  }'
```

WhatsApp Cloud API does not expose a customer typing webhook in Easyhook V1. Customer webhooks receive actual messages, message statuses, template updates, Flow submissions, and coexistence events.

### Coexistence History

Coexistence history callbacks are accepted quickly and processed asynchronously through Cloud Tasks. Easyhook persists normalized chunks before processing, works in batches of at most 100 events, and treats the Meta message ID as an idempotency key. Synchronization is included at no additional charge. Only one active synchronization is accepted per number, while an organization can process two numbers concurrently; additional numbers remain queued and resume automatically without consuming failure attempts. Another request for the same number returns `409 coexistence_sync_in_progress` with the current progress.

Historical messages do not execute live consent keyword handling or replay Flow submission side effects.

Historical inbound messages are delivered as `message.received`; historical outbound messages are delivered as `message.echo`. Both expose `message.source: history`, `message.direction`, explicit `message.from` and `message.to`, and the available synchronization metadata under `message.history`.

The subscription filter is `history.*`, but each event inside the batch uses the normalized public `type` `message.received` or `message.echo`. The delivery body is `{ "type": "sync.batch", "sync": {...}, "events": [...] }`; batches contain at most 100 events. A consumer must process every element of `events` and deduplicate using `message.id`.

Create the customer webhook subscription with the `history.*` filter before connecting the coexistence number or requesting synchronization if the integration needs the historical import. The portal endpoint `POST /v1/meta/whatsapp/phones/coexistence-sync` starts the initial Meta synchronization after onboarding consent. It is not an unrestricted historical export and must be used during Meta's onboarding eligibility window. Once completed, use Easyhook replay instead of requesting the import from Meta again.

During coexistence onboarding, the business must allow history sharing in the WhatsApp Business App and should keep the app open while the initial synchronization starts. Meta error `2593109` means history sharing is disabled; Easyhook normalizes it as `type: sync.failed` for `history.*` subscribers.

Consumers receive an Easyhook batch rather than Meta's raw callback. Process each normalized element in `events`. Build the conversation key from `account.id + ":" + contact.id`, deduplicate with `message.id`, order a conversation by `message.timestamp`, and prevent live auto-reply logic when `message.source` is `history`. Deliveries are at-least-once and retry up to five times. Meta sometimes supplies a stable country-scoped user ID instead of a phone; Easyhook maps it through state sync when possible and otherwise preserves it in `contact.id`/`contact.user_id` rather than guessing a number. The complete mapping contract is documented in [Customer Webhooks: Coexistence History](./customer-webhooks.md#coexistence-history).

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

State sync and history are complementary: `smb_app_state_sync.*` carries contact/app updates, while `history.*` carries historical messages. An integration rebuilding both contacts and conversations must subscribe to both filters before starting the sync. See [Customer Webhooks: Coexistence App State Sync](./customer-webhooks.md#coexistence-app-state-sync) for the payload and identity rules.

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
    "from": "5218661479075",
    "to": "5215660069997",
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
    "from": "5218661479075",
    "to": "5215660069997",
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
2. Easyhook marks that inbound message as read.
3. Easyhook waits a short estimated reading delay.
4. Easyhook sends WhatsApp typing.
5. Easyhook waits a short estimated typing delay.
6. Easyhook sends the text message.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/humanized-text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5218661479075",
    "to": "5215660069997",
    "body": "Thanks, I just checked it and we can help with that."
  }'
```

Optional explicit `message_id`:

```json
{
  "from": "5218661479075",
  "to": "5215660069997",
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



## Send Multichannel Text Message

Endpoint:

```http
POST /v1/messages/channel/text
```

This endpoint sends free-form text through a connected non-WhatsApp channel. It remains available for explicit channel sends, but `/v1/messages/text` is the preferred standardized endpoint.

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned channel alias, for example `page_<PAGE_ID>`, a Page username, `ig_<IG_BUSINESS_ID>`, an Instagram username, or a custom alias. |
| `to` | string | Provider recipient id. Messenger uses PSID. Instagram uses IGSID. |
| `body` | string | Message text. |

Example Messenger send:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"support-messenger","to":"PSID_VALUE","body":"Hello from Easyhook"}'
```

Example Instagram send:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"brand-instagram","to":"IGSID_VALUE","body":"Hello from Easyhook"}'
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

Uploads private Easyhook-managed media for a WhatsApp WABA. This media is reusable, does not expire, and is addressed by a unique `name` within that WABA. Use this for media that customer applications will send repeatedly from automations, CRMs, or internal tools.

Each WABA includes `1 GB` of active reusable media storage. Reusable media over that included quota is billed monthly at `3 MXN / GB / month`. Uploading reusable media does not expire and does not block at `1 GB`; the upload response includes the current WABA usage estimate when available:

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
| `from` | string | Tenant-owned WhatsApp business phone number. Digits are preferred, but formatted numbers are accepted. |
| `name` | string | Unique media name for this WABA. Use lowercase letters, numbers, `_`, `.`, or `-`. |
| `type` | string | `image`, `video`, `audio`, `document`, or `sticker`. |
| `file_name` | string | Original filename. |
| `file_type` | string | MIME type. |
| `file_base64` | string | Base64 encoded file bytes. |

Optional fields:

| Field | Type | Description |
| --- | --- | --- |
| `phone_id` | string | Legacy Easyhook phone row id. Prefer `from`. |

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
    \"from\": \"528661479075\",
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
GET /v1/media?from=528661479075
```

Requires `media:read`. Returns the reusable media library for the WABA behind `from`. Each item includes `download_url`, which can be fetched with the same API key.

Example:

```bash
curl -X GET "https://api.easyhook.dev/v1/media?from=528661479075" \
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
| `from` | string | Tenant-owned WhatsApp business phone number. Digits are preferred, but formatted numbers are accepted. |
| `to` | string | Recipient WhatsApp number. |
| `type` | string | Media type: `image`, `video`, `audio`, `document`, or `sticker`. |
| `media_name`, `id`, or `link` | string | Easyhook reusable media name, Meta media id, or public media URL. Exactly one is required. |

Required fields for Messenger/Instagram:

| Field | Type | Description |
| --- | --- | --- |
| `from` | string | Tenant-owned Messenger or Instagram channel alias/id. |
| `to` | string | Messenger PSID or Instagram IGSID. |
| `type` | string | `image`, `video`, `audio`, or `file`. `document` is normalized to `file`. |
| `id` or `link` | string | Existing provider attachment id or public HTTPS media URL. |

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
- Prefer Easyhook-managed reusable media for repeated sends. Session media can still use `id` or `link`.
- When `media_name` is used, Easyhook creates a short-lived signed URL internally and sends that URL to Meta. Customer applications only need to know the stable `media_name`.
- `media_name` is WhatsApp-only. Messenger and Instagram accept `id` or `link` through `/v1/messages/media`.

Example using a link:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"528661479075","to":"5218661479075","type":"image","link":"https://example.com/image.png","caption":"Imagen de prueba"}'
```

Example using reusable media:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"528661479075","to":"5218661479075","type":"image","media_name":"promo_image","caption":"Promo"}'
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
  -d '{"from":"528661479075"}'
```

Success response:

```json
{ "ok": true, "count": 2 }
```

### List Flows

Endpoint:

```http
GET /v1/flows?from=528661479075
```

Requires `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows?from=528661479075" \
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
    "from": "528661479075",
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
  -d '{"from":"528661479075"}'
```

### Delete Flow

Endpoint:

```http
DELETE /v1/flows/{local_flow_id}
```

Requires `flows:write`. Deletes the Flow in Meta and removes the local Easyhook Flow record. The WABA can be passed in the query string or JSON body.

```bash
curl -X DELETE "https://api.easyhook.dev/v1/flows/local_flow_uuid?from=528661479075" \
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
    "from": "528661479075",
    "to": "5218661479075",
    "flow_name": "communication_preferences",
    "body": "Manage your communication preferences.",
    "cta": "Open preferences",
    "flow_token": "contact_123_preferences"
  }'
```

### List Flow Submissions

Endpoint:

```http
GET /v1/flows/{local_flow_id}/submissions?from=528661479075
```

Requires `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows/local_flow_uuid/submissions?from=528661479075" \
  -H "Authorization: Bearer eh_live_xxx"
```

Success response:

```json
{
  "submissions": [
    {
      "id": "submission_uuid",
      "flow_token": "contact_123_preferences",
      "contact_wa_id": "5218661479075",
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

Use `scope: { "type": "phone", "from": "5218661479075" }` when only one WhatsApp number should receive the callback, or use `type: "waba"` with the same `from` number for every connected number in that WABA. Messenger and Instagram use `type: "channel"` with a channel alias. Meta Business Portfolio IDs are not public scopes.

Easyhook sends `flow.submitted` after the submission is stored. The payload includes the `flow.token` used when sending the Flow, the Flow identifiers, the WhatsApp contact, and the submitted `flow.data`.

If the submitted `data` contains `service_opt_in`, `marketing_opt_in`, `service_opt_out`, or `marketing_opt_out` as `true`, Easyhook also updates the contact consent state and stores an audit event with the Flow submission as evidence.

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": {
    "id": "980912725115744",
    "phone": "5218661479075"
  },
  "contact": {
    "id": "5218661479075"
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

Customer webhook admin parameters are documented in [Customer Webhooks](./customer-webhooks.md). In short, `POST /v1/hooks` accepts `tenant_id`, `name`, `url`, `events`, `providers`, `scope_type`, `scope_ref`, `auth_type`, and `auth_header_name`.

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
GET /v1/templates?from=528661479075
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
curl -X GET "https://api.easyhook.dev/v1/templates?from=528661479075" \
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
  -d '{"from":"528661479075"}'
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

## Create Template

Endpoint:

```http
POST /v1/templates
```

Requires `templates:write`. Creates a WhatsApp template in Meta and stores the local copy.

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
    "from": "528661479075",
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
              "example": "Benjamin"
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
  "from": "5218661479075",
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
  -d '{"from":"528661479075","template_id":"template_uuid"}'
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
    "body": ["Benjamin", "12345"]
  }
}
```

Object form for named or numbered variables:

```json
{
  "parameters": {
    "body": {
      "1": "Benjamin",
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
      "parameters": [{ "type": "text", "text": "Benjamin" }]
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
  "from": "5218661479075",
  "to": "5215551112222",
  "template": { "name": "monthly_offer", "language": "es_MX" },
  "media": { "link": "https://cdn.example.com/customer-specific-offer.jpg" },
  "parameters": { "body": ["Benjamin"] }
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
  -d '{"from":"528661479075","to":"5218661479075","template":{"name":"pedido_listo","language":"es_MX"},"parameters":{"body":["Benjamin"]}}'
```

Success response:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Documentation Rule

When changing public API behavior, update this document before merging/deploying the change. At minimum, update:

- Endpoint path and method.
- Authentication/scopes if they change.
- Required and optional fields.
- Error behavior.
- Example request.
- Important compliance or Meta-policy constraints.
