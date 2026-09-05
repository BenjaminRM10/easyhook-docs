# Channels

Easyhook brings WhatsApp, Messenger, Instagram, Telegram, TikTok Business,
email, and Mercado Libre under one organization, API key, wallet, Inbox, and
webhook system. Email can connect through Gmail, Outlook, or IMAP/SMTP. Every
send uses `from` to resolve the correct channel within the organization that
owns the API key.

## TikTok Business

TikTok is connected to OAuth from **Connect > TikTok Business**. Easyhook
requests only `message.list.read`, `message.list.send`, and
`message.list.manage`; it does not request access to campaigns, ads, pixels,
measurement, or CTX.

TikTok does not allow a business to start conversations. After a user writes,
the business can send up to 10 replies during the next 48 hours. TikTok
currently does not support Business Accounts registered
in the United States, EEA, Switzerland or United Kingdom for this API.

Use the webhook's `account.id` as `from` and preserve the opaque
conversation/contact identifier exactly as `to`. Easyhook normalizes text,
replies, typing indicators, read state, reply buttons, and images. Received
media is stored behind a private URL that requires the API key to download.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "tiktok-business-open-id",
    "to": "tiktok-conversation-id",
    "body": "Thank you for contacting us."
  }'
```

## Mercado Libre

Mercado Libre connects through OAuth. Easyhook requests only account read
access and read/write access to pre-sale and post-sale communications.

1. In Easyhook, open **Connect > Mercado Libre**.
2. Select the account's country.
3. Log in to Mercado Libre and authorize Easyhook.
4. When you return to the portal, the account appears as a channel available in Inbox,
   API and Webhooks.

Easyhook receives listing questions, post-sale messages initiated by a buyer,
and read notifications. You cannot start conversations. To reply, use the
normalized destination included in the event:

- `question:<id>` replies to a question.
- `pack:<id>` replies to a post-sale conversation.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "ml_123456789",
    "to": "question:987654321",
    "body": "Yes, it is still available."
  }'
```

Post-sale messages support up to 350 characters. Easyhook automatically rotates
the refresh token and encrypts credentials. Mercado Libre does not use
WhatsApp's 24-hour service window. The initial channel version processes text;
Mercado Libre attachments are not yet exposed as reusable Easyhook media.

### Application configuration

Register these exact values:

- Redirect URI:
  `https://api.easyhook.dev/v1/channels/mercadolibre/oauth/callback`
- Notifications call URL:
  `https://api.easyhook.dev/v1/channels/mercadolibre/webhook`
- OAuth flows: **Authorization Code** and **Refresh Token**.
- PKCE: enabled.
- Business: **Mercado Libre**.
- Users: read access.
- Pre and post-sales communications: reading and writing.
- Topics: `questions`, `messages.created` and `messages.read`.

Do not enable Client Credentials, listings, advertising, billing, metrics,
promotions, sales/shipping, or other topics if Easyhook will be used only for
messaging. Do not mark the app as certified until Mercado Libre formally grants
that certification.

## Telegram

Telegram works by bots.

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Create a bot and copy your token.
3. In Easyhook, open **Connect > Telegram**.
4. Paste the token and confirm.

Easyhook validates the bot, encrypts its token, and configures the webhook
automatically. You do not need to create another webhook in Telegram.

Telegram does not have a 24-hour service window in Easyhook. The bot can
respond or send messages at any time permitted by Telegram.

Send text with the standard endpoint:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@mi_easyhook_bot",
    "to": "123456789",
    "body": "Hello from Easyhook"
  }'
```

The recipient must have started a conversation with the bot first. To send
media, use `POST /v1/messages/media` with a public URL in `link`.

Incoming media initially includes Telegram file metadata. Automatic storage and
an Easyhook download link will be added later. When the channel is disconnected,
Easyhook first removes Telegram's protected webhook and then deletes the
encrypted token.

## Mail

All email providers use the same endpoint, payload, Inbox, and webhooks. You can
switch from Gmail to Outlook or an IMAP/SMTP server without rewriting the
integration that sends messages.

The 24-hour service window is a Meta messaging policy and does not apply to
email. Gmail, Outlook, and IMAP/SMTP can send messages at any time, subject only
to the provider's policies and limits.

### Gmail

Gmail appears as a mail channel within the shared Inbox.

1. In Easyhook, open **Connect > Gmail**.
2. Sign in to Google.
3. Check and authorize the permissions shown.
4. Google returns to the portal and the account is available as a sender.

Easyhook uses `gmail.modify` to:

- Detect new email through Google Pub/Sub.
- Read the content needed to show it in the Inbox.
- Send messages and answers.
- Preserve the subject, HTML, and correct thread.
- Maintain message state for the connected account.

Gmail information is not used for advertising.

Easyhook supports text, HTML, attachments, new messages, in-thread replies,
forwarding, read/unread, archive, and delete actions.

Send an e-mail:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support@company.com",
    "to": "customer@example.com",
    "subject": "Seguimiento",
    "body": "Hello, we are following up on your request."
  }'
```

To reply in an existing thread, send `reply_to_message_id` with the incoming
message's `message.id`. Easyhook resolves the Gmail thread and headers
automatically. See every field and example in the
[Full reference](/api-reference#email-gmail-outlook-and-imapsmtp).

In the Inbox, the filter icon appears when selecting a mail account.
Gmail supports category, unread, starred, and important filters; Outlook
supports Focused, Other, and unread; IMAP/SMTP supports unread and starred.

When Gmail is disconnected from **Organization**, Easyhook stops Gmail
notifications, revokes OAuth authorization, and deletes the encrypted credential.

### Outlook

1. In Easyhook, open **Connect > Outlook**.
2. Sign in with Microsoft and authorize the requested access.
3. Microsoft returns to the portal and the address is available as a sender.

Easyhook uses Microsoft Graph to receive new email, send messages, and reply in
the original thread. Microsoft Graph subscriptions are renewed
automatically. For an exact answer, send `reply_to_message_id` with
`message.id` received by webhook or visible in the Inbox.

### IMAP/SMTP

Use this option for providers other than Gmail and Outlook.

1. Open **Connect > Other email (IMAP/SMTP)**.
2. Enter the address, IMAP and SMTP servers, ports, user and
   app password.
3. Easyhook verifies both connections before saving the channel.

Easyhook requires TLS or STARTTLS with valid certificates and blocks local,
private, and metadata servers. Many providers require an app password; do not
use your main password when that option is available.

Reception checks for new messages every minute after connection. Easyhook does
not automatically import the earlier mailbox. Replies preserve `Message-ID`,
`In-Reply-To`, and `References`.

### Gmail review video

Record one continuous flow:

1. Open **Connect > Gmail**.
2. Show Google's consent screen and the requested permission.
3. Complete the connection and display the account within Easyhook.
4. Send an e-mail from another account and show it to the Easyhook Inbox.
5. Reply from Easyhook and show the response in the same Gmail thread.
6. Send another email through `POST /v1/messages/email` and show its arrival.

Short text to justify `gmail.modify`:

> Easyhook is a multi-channel messaging API and a shared inbox.
> `gmail.modify` allows the owner to connect Gmail, receive and read their
> messages in Easyhook, send emails and replies in the same thread, and maintain
> message state. Data is isolated by organization and encrypted
> in transit and rest, and are not used for advertising.

## Multichannel Webhooks

In **Webhooks**, you can subscribe to the entire organization or a specific
channel. Select `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, or
`tiktok` with `message.*`. The JSON preserves the same normalized contract:

```json
{
  "id": "event-id",
  "type": "message.received",
  "channel": "gmail",
  "account": { "id": "support@company.com" },
  "contact": { "id": "customer@example.com", "name": "Ana" },
  "message": {
    "id": "gmail-message-id",
    "type": "text",
    "text": "I need help",
    "subject": "Request",
    "thread_id": "gmail-thread-id",
    "timestamp": "2026-07-26T20:00:00.000Z"
  }
}
```

Received content, including HTML and Telegram text, is untrusted input. Sanitize
or escape it before rendering it in an application.
