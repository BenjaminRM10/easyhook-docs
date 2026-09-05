# Inbox, team, and mobile app

Easyhook includes a multichannel web Inbox and an Android app. Both use the
same conversations, permissions, states, reusable media, and wallet. You can
handle WhatsApp, Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP,
Mercado Libre, TikTok Business Messaging, Live Chat, and phone calls without
switching products.

## A simple team model

An organization can invite members by email. Roles apply per organization, so
the same person can be an administrator in one and an agent in another.

- **Administrator:** manages the organization and works in the Inbox.
- **Developer:** integrates the API, webhooks, and technical tools.
- **Agent:** handles conversations and uses reusable media.

When an organization has more than one member, Easyhook enables assignment,
presence, assigned and unassigned views, agent attribution, and private or group
team chats. These controls stay hidden in one-person organizations to preserve a
simple experience.

Owners and administrators can open the settings next to their presence state in
the Inbox header and enable or disable **automatic assignment**. When enabled,
Easyhook distributes new conversations in rotation among available owners,
administrators, and agents.

## Inbox capabilities

- Remote search and combined filters for channel, unread, pinned, and assigned conversations.
- Realtime with local cache and incremental update.
- Text, secure HTML email, media, stickers, templates and compatible buttons.
- Replies, reactions, edits, deletion, typing, and read receipts when supported by the channel.
- Media display with navigation through the conversation files.
- 24-hour window and WhatsApp templates applied by the server.
- Connection status and health updated regularly.

## Android App

The app supports owners, administrators, and agents. It is focused on
messaging; connecting channels, topping up the wallet, creating API keys, and
managing webhooks remain in the web portal. It includes configurable
notifications, conversation deep links, a local cache, drafts, and language
preferences for ES, EN, and PT-BR.

When no filters are selected, notifications include every organization the
account can access. Channel selections and the assigned-conversation preference
are stored per organization, so the same channel identifier in two organizations
does not share configuration.

The official APK is downloaded from **Portal > Integrations > Easyhook mobile**.
Android may warn that the app comes from outside the Play Store because it is
distributed directly. Verify that the download comes from `easyhook.dev`.

## Billing

Actions that reach a provider—such as sending, replying, reacting, marking as
read, typing, and email actions—consume wallet balance at the same per-operation
price as the public API. Browsing, searching, filtering, receiving messages,
using the cache, receiving notifications, and realtime refreshes are free.
