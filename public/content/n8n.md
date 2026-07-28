# n8n-nodes-easyhook

Verified n8n community node for using Easyhook.

Easyhook is a lightweight multichannel messaging API for WhatsApp, Telegram,
Gmail, Outlook, generic IMAP/SMTP email, and Mercado Libre.

- `Message Action` groups cross-channel text and media actions.
- Email actions work the same way with Gmail, Outlook, and IMAP/SMTP: send,
  reply, forward, mark read/unread, archive, and create/edit/send drafts.
- `WhatsApp Only` groups templates, Flows, consent, onboarding links, read receipts, and typing indicators.
- Use standard or humanized WhatsApp text delivery
- Schedule messages with Easyhook's `at` parameter
- Upload reusable media and send it later by `media_name`
- List/sync templates and media
- Cancel scheduled messages before processing begins
- Create hosted WhatsApp onboarding links
- Send Easyhook opt-in and opt-out Flows
- Receive Easyhook webhook events in n8n with the Easyhook Trigger node

## Install

In n8n, open **Settings > Community Nodes** and install:

```text
n8n-nodes-easyhook
```

For self-hosted n8n, you can also install it manually in your n8n custom nodes folder.

## Credentials

Create an **Easyhook API** credential:

- API Key: your `eh_live_...` key from Easyhook
n8n validates the credential with `GET /v1/me`, so no WhatsApp number is needed just to test the API key.

## Common Examples

### Receive Webhooks

Use **Easyhook Trigger** as the first node in a workflow.

1. Add the Easyhook Trigger node.
2. Select your Easyhook API credential.
3. Choose a provider. Easyhook filters the available events and scope types automatically.
4. Choose a scope. For WABAs, WhatsApp numbers, Messenger Pages, or Instagram accounts, select a connected account from the list loaded with your API credential.
5. Activate the workflow.

n8n registers its Production URL in Easyhook automatically and stores the HMAC signing secret in the workflow's private static data. Deactivating or deleting the workflow removes the Easyhook subscription. No portal setup or secret copy/paste is required.

WhatsApp uses the same three levels as the Easyhook portal: **Entire Organization → WABA → WhatsApp Number**. Selecting a WABA receives matching events from all numbers connected to it. Meta Business Portfolios stay internal and never appear as n8n scopes.

The trigger outputs the normalized Easyhook webhook JSON directly.

### Mercado Libre

Choose `Mercado Libre` in the Easyhook Trigger to receive product questions
and post-sale messages. To reply, use **Message Action > Send Text**, select the
connected seller as **From**, and map `contact.id` from the trigger into
**To**. The value will be `question:<id>` or `pack:<id>`.

Do not replace that destination with a buyer ID. Mercado Libre requires the
question or sale pack context and does not permit arbitrary conversations.

### Send Text

- Resource: `Message Action`
- Operation: `Send Text`
- From: `5218661479075`
- To: `5215660069997`
- Body: `Hello from n8n`

Choose **Delivery: Humanized** when you want Easyhook to mark the latest inbound WhatsApp message as read, wait a human-like read/typing delay, show typing, and then send the text. If you already know the inbound WhatsApp `wamid`, put it in **Inbound Message ID**; otherwise Easyhook uses the latest inbound message from `To`.

For scheduled text, media, or templates, add:

- `Schedule At`: ISO 8601 execution time
- `Options > Client Reference`: optional identifier from your application
- `Options > Idempotency Key`: optional stable key used only when retrying the same scheduled send

Use resource **Cancel Scheduled Message** when you need to cancel a send before processing begins. Reconciliation remains available through the Easyhook API and webhooks.

Under **WhatsApp Only** you can also create an onboarding link, create and send
that link, choose WhatsApp Coexistence or WhatsApp API, send the consent Flow,
and add or remove reactions.

### Send Email

- Resource: `Message Action`
- Operation: `Send Email`
- From Email: select a connected Gmail, Outlook, or IMAP/SMTP address
- To Email: recipient email
- Subject: message subject
- Message: plain-text content
- HTML Message: optional rich body

To answer an existing email, select `Reply to Email` and map `message.id` from
the Easyhook Trigger into **Original Email ID**. Easyhook resolves the Gmail
thread, Outlook native reply, or IMAP headers automatically. The node does not
ask for `Thread ID`, `In-Reply-To`, or `References`.

The **From Email** list contains only email accounts connected to the API-key
organization; WhatsApp numbers and other channels are excluded. All three
providers use `POST /v1/messages/email`, so a workflow does not need
provider-specific branches.

To attach files, add entries under **Attachments** and select each incoming
binary field. Easyhook uses the binary file name and MIME type automatically;
the optional overrides are only needed when the incoming binary metadata is
incomplete.

Other email operations:

- `Forward Email`: map the trigger's `message.id`, choose the destination, and
  optionally add a note.
- `Update Email`: map `message.id` and choose read, unread, or archive.
- `Create Email Draft`: enter recipient, subject, message, optional HTML, and
  attachments.
- `Edit Email Draft`: provide the returned Draft ID and replacement content.
- `Send Email Draft`: provide the Draft ID and connected From Email.

### Send Read, Typing, Or Reaction

- Resource: `WhatsApp Only`
- Operation: `Send Read Receipt`, `Send Typing Indicator`, or `Send Reaction`
- From: your WhatsApp sender number
- Inbound Message ID: the inbound WhatsApp `wamid`

For reactions, select the recipient and emoji. Leave the emoji empty to remove the current reaction.

### Send Reusable Media

First upload media:

- Resource: `Media`
- Operation: `Upload`
- From: your WhatsApp sender number
- Name: `promo_image`
- Type: `Image`
- Source: `Binary Property`
- Binary Property: `data`

Then send it:

- Resource: `Message Action`
- Operation: `Send Media`
- From: your WhatsApp sender number
- To: customer WhatsApp ID
- Type: `Image`
- Media Reference Type: `Reusable Media Name`
- Media Name: `promo_image`

### Send Template

- Resource: `WhatsApp Only`
- Operation: `Send Template`
- Template Source: `Enter Manually`
- Template Name: the approved template name in Easyhook/Meta
- Language: select the Meta language code from the list, for example `es_MX` or `en_US`
- Template Data: choose `Map Automatically` to load the template definition by name and language, or `Custom Components (JSON)` to provide raw components.

Both template sources support the same data modes. `Choose From Easyhook` selects an approved template from a list; `Enter Manually` resolves the approved template using the typed name and selected language. `Map Automatically` then creates only the fields required at send time:

- Header text variables
- Header image, video, or document URL and optional document filename
- Header location fields
- Body variables, including named variables
- Dynamic URL button values
- Quick reply payloads
- Copy-code coupon values

For image, video, or document headers, the mapped header URL replaces the approval example for that
individual send. Leave it empty only when the template has a default approval asset stored in Easyhook.
The dynamic media type must match the template's approved header type. `Custom Components (JSON)` can
instead provide a raw Meta media header using either `id` or an HTTPS `link`.

Use `Custom Components (JSON)` when you need to provide raw Meta `components`. The value can be a components array or `{ "components": [...] }`. Template text itself remains fixed by the approved Meta template.

Text header, body variables, and dynamic URL button:

```json
[
  {
    "type": "header",
    "parameters": [{ "type": "text", "text": "PED-1048" }]
  },
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "Benjamin" },
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
          "text": "Benjamin"
        }
      ]
    }
  ]
}
```

Media links must use HTTPS and be downloadable by Meta without authentication. A dynamic URL button value is the variable suffix, not the complete URL. Use `[]` when the template has no runtime components.

### Send WhatsApp Flow

- Resource: `WhatsApp Only`
- Operation: `Send Flow`
- From: your WhatsApp sender number
- To: customer WhatsApp number
- Flow Name: the Easyhook flow name
- Message Body: the text above the flow button
- Button Text: the flow button label
- Flow Data: optional key/value fields sent as the flow payload

### Consent And Hosted Onboarding

Under **WhatsApp Only**:

- **Send Opt-In or Opt-Out** sends the WABA consent Flow to a WhatsApp contact.
- **Create Onboarding Link** creates a hosted Easyhook link for Cloud API or Coexistence signup. The connection is registered under the organization that owns the API credential.

### Webhook Automation

Easyhook webhooks are handled with **Easyhook Trigger**. It is not a polling node: activation creates a `/v1/webhooks` subscription for the n8n Production URL and deactivation removes it. Deliveries are authenticated automatically with `X-Easyhook-Signature: sha256=<hex>`.

Useful event scopes:

- `message.*`: incoming WhatsApp/Messenger/Instagram messages
- `status.*`: message delivery/read/failure status
- `template.*`: template status changes
- `flow.submission.*`: WhatsApp Flow responses
- `smb_message_echo.*`: WhatsApp Business App coexistence message echoes
- `smb_app_state_sync.*`: WhatsApp Business App coexistence contact/app state sync
- `history.*`: coexistence history sync events
- `account_update.*`: WhatsApp account updates
- `media.*`: media lifecycle events, when enabled in Easyhook
- `message.text`, `message.image`, `status.failed`: narrower event filters matching the Easyhook portal

For email workflows select `Gmail`, `Outlook`, or `Email (IMAP/SMTP)` as the
trigger provider and `message.*`. Incoming email exposes `message.subject`,
`message.text`, optional `message.html`, `message.thread_id`, and RFC reply
headers. One webhook request creates one n8n execution; normal non-sync events
produce one item.

Messenger and Instagram hooks are configured in the Easyhook portal with the provider filter. In n8n you can also label a trigger as `messenger.message.*` or `instagram.message.*` for workflow clarity.

### Receive Coexistence History

Configure the **Easyhook Trigger** before connecting the WhatsApp Business App number or requesting coexistence sync:

1. Select `Provider: WhatsApp`.
2. Select `Event: Coexistence history (history.*)`.
3. Choose the organization, WABA, or WhatsApp number scope.
4. Activate the workflow.
5. Allow history sharing in the WhatsApp Business App and keep the app open while synchronization starts.

Easyhook creates the webhook subscription and stores its HMAC secret in n8n automatically. Do not create a second portal webhook. `message.*` only covers live messages; it does not include history imports.

Easyhook delivers synchronization data in batches of at most 100 events. One batch starts one workflow execution, and the trigger expands it into one n8n item per event. Historical inbound messages use `type: message.received`; historical outbound messages use `type: message.echo`. Both include `message.source: history`. Every expanded item also includes `_sync` with the session, cursor and progress metadata:

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

Use `message.id` as the idempotency key. A failed destination is retried up to five times, so workflows must tolerate receiving the same item again. Messages are ordered within each conversation, but different conversations can progress concurrently.

Historical media does not delay the message import. The first item can contain `message.media.storage_status: pending`; once Easyhook finishes downloading an available Meta asset, the trigger receives a second item with `type: message.media_available` and the same `message.id`.

If the business disables history sharing, Meta can return error `2593109`; the trigger receives it as `type: sync.failed` under the same `history.*` selection.

## Development

```bash
cd packages/n8n-nodes-easyhook
npm install
npm run build
npm pack --dry-run
```

Before submitting for n8n verification, publish through GitHub Actions with npm provenance as required by n8n's current community node guidelines.
