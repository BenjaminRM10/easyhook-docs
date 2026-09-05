# Chatwoot

The integration connects Easyhook channels to Chatwoot API inboxes. Easyhook
handles transport; Chatwoot manages contacts, conversations, agents, and
automations.

The compatible channels are WhatsApp, Messenger, Instagram, Telegram, TikTok
Business, Gmail, Outlook, IMAP/SMTP email, and Mercado Libre. Each selected
channel creates its own inbox so identities and conversations do not mix.

## Requirements

- An accessible installation of Chatwoot.
- A Chatwoot API access token.
- At least one number or channel connected to Easyhook.

## Settings

1. In Chatwoot, create an **API** inbox.
2. In Easyhook, open **Integrations → Chatwoot**.
3. Enter the Chatwoot URL, Account ID and token.
4. Select one or more channels from the organization.
5. Easyhook creates or links an inbox for each channel and configures two-way delivery.

Inbox names come from the connected channel. You can rename them later in Chatwoot.

## Behavior

- Incoming messages create or update a contact and conversation.
- Messages sent from WhatsApp Business App via Coexistence appear as outgoing messages.
- Messages sent from Chatwoot pass through Easyhook and use the organization's wallet.
- Text, images, video, audio, documents and compatible stickers are delivered as attachments.
- Sent, delivered, and read states are synchronized when Chatwoot can represent them.
- `typing` events become typing indicators when the Chatwoot API supports them.
- The responses maintain the necessary native context: remote recipient
  for messaging, question or pack for Mercado Libre, and message or thread for
  email.
- TikTok keeps its opaque conversation identifier, 48-hour window, and limit of
  10 business replies; Chatwoot cannot start a new TikTok conversation.

## Import contacts and history

The initial import described here applies only to WhatsApp Coexistence contacts
and history that Easyhook received from Meta during onboarding. Other channels
start with the events available after they are connected.

- Keep the original dates.
- It does not send messages back to WhatsApp.
- It should not trigger bots or automations as if they were new messages.
- The import is idempotent by external identifier of the message.

The initial synchronization depends on having authorized a history in WhatsApp Business App when connecting the number.
