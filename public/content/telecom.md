# Easyhook Telecom API

Easyhook ofrece un contrato estable para números, SMS, MMS y llamadas sin exponer objetos propios del proveedor. La disponibilidad depende de las capacidades del número, el país y los requisitos regulatorios aplicables.

## Design

Easyhook exposes stable resources (`numbers`, `messages`, `calls`) instead of provider-native objects. A number records a capability vector, so clients can ask what it supports rather than branching on Telnyx, Infobip, DIDLogic, WhatsApp Calling or a future provider.

Provider credentials are platform secrets. Tenant authorization always comes from the Easyhook API key and every number/call lookup is scoped to its organization.

## Scopes

- `telephony:read`: number availability, connected numbers and call state.
- `telephony:write`: SMS/MMS and call commands.
- Existing `messages:read` / `messages:write` keys remain accepted during the migration period.

New default API keys include both telephony scopes.

## Endpoints

### Capabilities

`GET /v1/telecom/capabilities`

Returns providers configured on the deployment and the stable contract versions.

### Connected numbers

`GET /v1/telecom/numbers`

### Search provider inventory

`GET /v1/telecom/numbers/available?country_code=MX&area_code=81&capabilities=sms.outbound&capabilities=voice.outbound`

Search does not purchase a number. Inventory and regulatory requirements may change between search and order.

Results expose `activation_price`, `initial_period_price`, `monthly_price`, `due_today`, `initial_period`, `next_renewal_at`, and customer-facing `usage_estimates` in the wallet currency. `activation_price` is a one-time activation charge. `initial_period_price` prorates the recurring Easyhook price by inclusive UTC calendar days from the purchase date through the end of that month. `due_today` is activation plus that initial period; `monthly_price` is the full amount charged in advance on the first day of later months. Provider-native payloads, underlying costs, and internal commercial rules are deliberately not returned. Inventory is omitted when Easyhook cannot offer and verify a competitive price.

### Purchase a number

`POST /v1/telecom/numbers/orders`

```json
{
  "phone_number": "+15551234567",
  "country_code": "US",
  "messaging_profile_id": "<optional-easyhook-profile-uuid>",
  "expected_currency": "USD",
  "expected_activation_amount_millicents": 100000,
  "expected_initial_period_amount_millicents": 23371,
  "expected_monthly_amount_millicents": 103500,
  "expected_due_today_amount_millicents": 123371
}
```

`Idempotency-Key` is mandatory. Easyhook searches the exact number again, rejects stale prices—including a quote that crossed a UTC month boundary—verifies regulatory readiness, reserves the complete `due_today` amount in the wallet and only then orders from the provider. A changed quote returns `409 telecom_price_changed` with the current activation, initial-period, monthly, due-today, period-boundary, and renewal values. Numbers requiring a regulatory workflow remain unavailable until that workflow is implemented.

Messaging profiles are Easyhook resources scoped to one organization and one consent program. SMS/MMS-capable numbers require an active profile that supports the destination country; when `messaging_profile_id` is omitted, Easyhook uses that organization's single default profile and provisions it automatically on the first compatible number purchase when none exists. Carrier profile IDs, opt-out state and keyword configuration are never global or accepted from customer requests. Voice-only numbers do not require a messaging profile.

A purchased SMS/MMS-capable number also creates an active Easyhook `sms` channel and phone-number alias in the same organization. Inbound messages are persisted in the shared Inbox under that channel; voice calls use the same telecom number and contact identity while retaining their separate call lifecycle. A Messaging Profile is reusable by the organization's numbers that share the same consent program—it is not created once per number.

### SMS or MMS

Canonical endpoint: `POST /v1/messages/text`.

```json
{
  "channel": "sms",
  "from": "+15551234567",
  "to": "+528441234567",
  "body": "Hola desde Easyhook"
}
```

`channel` can be omitted when the number identifies only Telefonía. Include it
when that same number is also connected to WhatsApp. The legacy
`POST /v1/messages/sms` route remains temporarily available and returns a
deprecation header. MMS uses the canonical `/v1/messages/media` contract once
the destination tariff and number capability are enabled.

Both numbers must be E.164. `from` must be an active number owned by the authenticated organization with the required capability. Use `Idempotency-Key` for every command.

For SMS or MMS, Easyhook places a conservative, refundable wallet hold before
contacting the carrier. A successful `202` response exposes that hold as
`maximum_reserved_cost`; it is not the final charge. When the signed
`message.finalized` event arrives, Easyhook settles the current customer tariff
against the confirmed billable amount and returns the unused hold. This permits
destination- and carrier-dependent pricing without guessing a carrier rate
before delivery. Inbound messages do not receive a later `message.finalized`
event. Easyhook creates a deterministic hold from the signed
`message.received` callback and settles it immediately from the carrier cost in
that same callback, returning any unused balance.

### Start a call

`POST /v1/calls`

```json
{
  "channel": "phone",
  "from": "+15551234567",
  "to": "+528441234567",
  "endpoint_id": "<registered-call-endpoint-uuid>",
  "max_duration_seconds": 1800
}
```

For outbound AI campaigns, configure a second ElevenLabs agent for the number.
The inbound agent answers customers; the outbound agent initiates campaigns
with its own first message, prompt and tools. Easyhook does not allow both
directions to share the same agent because their opening behavior is different.
Easyhook originates the PSTN leg, waits until the person answers, and then
bridges it over SIP to the configured outbound agent; audio is not proxied
through Easyhook. The agent receives the optional per-call `context` as
sanitized `X-Easyhook-*` SIP headers (scalar strings, numbers and booleans
only; no credentials or message content). Prompts, voices and tools remain
managed in ElevenLabs.

```json
{
  "channel": "phone",
  "handler": "ai",
  "from": "+15551234567",
  "to": "+528441234567",
  "max_duration_seconds": 900,
  "context": { "customer_id": "crm-1842", "language": "es" }
}
```

AI-initiated calls require a prior explicit voice opt-in for the exact
organization, Easyhook number and destination. Record it with
`POST /v1/consent` using `channel: "voice"`, `status: "opt_in"`, a non-empty
`evidence` object and `captured_at`; record `opt_out` immediately when the
contact withdraws permission. Easyhook enforces one AI attempt per hour and
three per rolling 24 hours per number/contact, in addition to idempotency.
The API returns `voice_ai_consent_required`, `voice_ai_contact_opted_out`,
`voice_ai_outreach_too_soon` or `voice_ai_outreach_daily_limit` when a call is
blocked. These voice rules complement (and do not replace) Telnyx messaging
STOP/START handling.

`POST /v1/calls` never accepts an arbitrary ElevenLabs agent ID. With
`handler: "ai"`, Easyhook uses only the outbound agent that an organization
owner or admin associated with that exact Easyhook number. If it is absent,
the API returns `409 voice_ai_outbound_agent_not_configured`; it never falls
back to the inbound agent.

`handler` defaults to `human`. It is valid only for `channel: "phone"` when
set to `ai`; WhatsApp Calling does not use the ElevenLabs SIP bridge. The
response for an AI call is `202` with the normal call resource and no WebRTC
token. The same call can still be read and hung up through the standard call
endpoints. Wallet billing remains Easyhook's normal API fee plus rounded
Telnyx voice usage; the customer separately consumes the minutes included in
their ElevenLabs plan.

Use `channel: "phone"` for PSTN and `channel: "whatsapp"` for WhatsApp
Calling when the same `from` can resolve to both. It is optional otherwise.

`max_duration_seconds` is required (`30`–`14400`). It determines the maximum wallet reservation. Easyhook starts an authenticated server-side deadline when the provider reports the call answered; the deadline terminates the provider leg and settles the reservation even if the browser, phone or customer process remains connected or is manipulated. If a client obtains WebRTC credentials but no provider call starts within two minutes, Easyhook cancels the pending call and returns the complete reservation.

Telnyx `webrtc.dial.client_state` is a signed, two-minute, single-call authorization bound to the exact organization, call, endpoint, caller, destination and maximum duration. The Credential Connection parks the WebRTC leg; Easyhook validates the authorization and creates one idempotent PSTN leg through the Call Control application using Telnyx `link_to` and `bridge_on_answer`, so both legs are connected atomically when the destination answers. The PSTN leg retains the same signed authorization and is stored as a peer of the canonical WebRTC leg. Easyhook rejects and immediately terminates an outbound provider leg when that authorization is missing, expired, altered, replayed after another leg won, or does not match the Telnyx webhook. A Telnyx JWT by itself is never authorization to place an Easyhook-billed call.

For WhatsApp Calling, use a tenant-owned `phone_id` (or its configured sender in `from`) and send the WebRTC offer:

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "from": "15551234567",
  "to": "528441234567",
  "max_duration_seconds": 1800,
  "session": { "sdp_type": "offer", "sdp": "v=0..." }
}
```

Business-initiated WhatsApp calls require permission from the user. Meta returns its documented calling error when permission is absent. Media never traverses Easyhook: the client negotiates WebRTC with Meta or Telnyx while Easyhook handles authorization, routing, state, wallet and normalized webhooks. For Telnyx, the response contains `webrtc.token` and `webrtc.dial`; call `TelnyxRTC.newCall` with those normalized values. For outbound WhatsApp, poll `GET /v1/calls/{call_id}/signaling` until `session.ready` and install the returned SDP answer as the peer connection's remote description.

Request business-initiated WhatsApp calling permission before dialing:

Check the current permission and Meta's currently allowed actions first:

`GET /v1/whatsapp/calling/permissions?from=15551234567&to=528441234567`

The response preserves Meta's `permission_status` and action limits. Only call when `start_call` is allowed; send a permission request only when `send_call_permission_request` is allowed.

`POST /v1/whatsapp/calling/permissions`

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "to": "528441234567",
  "body": "¿Podemos llamarte para ayudarte con tu solicitud?"
}
```

Meta controls eligibility, expiration and rate limits. Easyhook normalizes the permission reply as an inbound interaction/webhook; it is never inferred from ordinary text.

### Register an answering endpoint

`POST /v1/call-endpoints`

```json
{
  "endpoint_key": "installation-or-worker-id",
  "kind": "android",
  "user_id": "<organization-member-user-id>",
  "status": "available",
  "metadata": { "mobile_device_id": "<mobile_devices.id>" }
}
```

Use exactly one of `user_id` or `external_agent_id`. Web, Android and iOS endpoints receive a short-lived Telnyx WebRTC JWT and a stable endpoint ID. Refresh it with `POST /v1/call-endpoints/{endpoint_id}/token`; Easyhook never returns a customer SIP password. Heartbeat by upserting the same `endpoint_key`; an endpoint is routable only while `available` and seen in the last 90 seconds.

External endpoints use `external_agent_id`. A `sip` endpoint must provide a validated `provider_address` such as `sip:agent@example.com`; a Telnyx call is offered to an `api` endpoint only when it also has a provider SIP address, because a webhook alone cannot carry audio. WhatsApp calls can be offered to an `api` endpoint without a SIP address: claim returns the short-lived SDP offer and the integration answers through `pre-accept` and `accept`. SIP endpoints are not selected for WhatsApp because Meta uses its WebRTC/SDP calling contract rather than a customer SIP leg.

### Answering contract

- `POST /v1/calls/{call_id}/actions/claim` atomically wins a call for `endpoint_id`.
- For inbound WhatsApp, claim returns Meta's SDP offer. Generate an answer, call `pre-accept`, establish WebRTC, then call `accept` with the exact same SDP answer; this avoids clipped audio at the start and follows Meta's session contract.
- `POST /v1/calls/{call_id}/actions/pre-accept` with `endpoint_id` and `sdp`.
- `POST /v1/calls/{call_id}/actions/accept` with `endpoint_id` and `sdp`.
- `POST /v1/calls/{call_id}/actions/decline` offers the call to the next eligible endpoint.
- `POST /v1/calls/{call_id}/actions/hangup` terminates Telnyx or WhatsApp through the correct provider.

Default team routing is deliberately quiet: assigned available agent first, then least-recently-offered agent; owners/admins are fallback. Exactly one endpoint rings for 20 seconds. Cloud Tasks expires the lease and offers the next compatible endpoint. API/SIP endpoints participate in the same order, so customer applications can answer without using the Easyhook inbox, but Easyhook never offers a provider leg to an endpoint that cannot carry its media.

Read or update the policy with `GET /v1/call-routing` and `PATCH /v1/call-routing`. Strategies are `assigned_then_round_robin` (default), `round_robin`, and `api_only`; configurable bounds are 8–30 seconds per attempt and 1–10 attempts. Multiple devices belonging to one agent remain separate endpoints, but only the selected endpoint receives the private offer. A declined or expired offer advances to the next eligible endpoint instead of ringing every device.

Portal and mobile use the same runtime through server-authorized `/admin/calls/*` routes. The Vercel portal exposes only an allowlist under `/api/calls/*`, preserves the authenticated tenant/actor signature and never sends a customer API key to the browser or phone. Calls initiated from an inbox use the same provider-usage wallet reservation.

### ElevenLabs voice agents (portal integration)

Organizations can connect their own ElevenLabs API key from the portal under
Integrations. Easyhook validates the key, stores it encrypted in the tenant's
secret vault and exposes only the connection status and the organization's agent
names. The key is never returned to a browser, mobile app or customer webhook.

The portal assigns an inbound ElevenLabs Conversational AI agent and,
optionally, a distinct outbound agent to an active Easyhook Telnyx number.
Easyhook imports the public number for inbound routing and uses a private,
non-dialable SIP identifier for outbound routing. Telnyx sends audio directly
to ElevenLabs; Easyhook does not proxy or transcribe the audio. Each number has
its own binding:

- `ai_only`: ElevenLabs answers; no human endpoint is offered.
- `ai_then_agents`: ElevenLabs receives the first attempt, then normal human
  routing is used if the AI attempt is unavailable or expires.

`human_transfer_enabled` is independent from those initial-answer modes. When
enabled, Easyhook installs a managed `transfer_to_number` system tool on the
selected ElevenLabs agent. A transfer requested during an active AI
conversation uses SIP REFER to an opaque HMAC-signed Easyhook target; Easyhook
verifies the binding, organization, number and active call session before
offering the call only to eligible human portal/mobile endpoints. Other agent
tools and customer transfer rules are preserved. `api_only` routing never rings
Easyhook human clients.

Portal-admin routes are:

- `GET /admin/integrations/elevenlabs`
- `POST /admin/integrations/elevenlabs` with `{ "tenant_id", "api_key" }`
- `GET /admin/integrations/elevenlabs/agents`
- `GET /admin/telecom/voice-ai`
- `PUT /admin/telecom/numbers/{number_id}/voice-ai` with inbound `agent_id`,
  optional distinct `outbound_agent_id`, `mode`,
  optional `answer_timeout_seconds` (`8`–`30`) and
  `human_transfer_enabled`
- `DELETE /admin/telecom/numbers/{number_id}/voice-ai`

The agent's system prompt, voice, knowledge base and tools remain managed in
ElevenLabs. Webhook or n8n tools can provide customer business logic without
placing n8n in the real-time audio loop.

### Read or hang up a call

- `GET /v1/calls/{call_id}`
- `GET /v1/calls/{call_id}/signaling`
- `POST /v1/calls/{call_id}/actions/hangup`

## Webhooks

Subscribe with provider `sms`, `voice` or `whatsapp`:

- `message.received`
- `message.status`
- `call.initiated`
- `call.answered`
- `call.hangup`
- `call.connect`
- `call.ringing`
- `call.accepted`
- `call.terminate`
- `number.renewal_due`
- `number.renewed`
- `number.grace`
- `number.released`

Provider webhooks are verified with Ed25519 over the exact raw body, reject timestamps older than five minutes and are deduplicated before processing. Easyhook then emits its normal signed customer webhook.

## Billing contract

Telecom billing has three separately visible components:

1. recurring number rental, charged in advance;
2. provider usage (segments, media or rounded call minutes);
3. Easyhook service margin.

Customer-facing rules are:

- activation is charged once;
- the initial number period is prorated by inclusive UTC calendar days remaining in the purchase month and added to `due_today`;
- later rent renews in advance at `00:00 UTC` on the first day of each month;
- inbound and outbound SMS/MMS are billable by segment or message as shown in the quote;
- voice is billable by rounded minute and varies by direction and destination;
- MXN quotes include exchange-rate protection, so the displayed and confirmed amount is the customer amount;
- inventory is unavailable unless Easyhook can verify and honor a competitive price.

Underlying carrier costs, comparison sources, and Easyhook's internal commercial formula are not part of the public contract. The purchase confirmation and API response expose only the amounts the customer may be charged.

Tariffs are versioned, have verification and validity timestamps, and are service-role-only. No hard-coded sample rate enables a country. Number purchase is enabled only when the deployment has Telnyx credentials, an exact current inventory price, fresh FX data and a matching verified benchmark. Porting remains disabled until the regulatory workflow is complete.

Competitor benchmarks are stored separately from sellable provider tariffs. The
Twilio Pricing API supplies public `base_price` values; Easyhook deliberately
does not benchmark against account-specific `current_price` discounts. For SMS,
the lowest carrier/sender base price in a country is the conservative benchmark.
For voice, benchmarks retain the longest destination-prefix detail returned by
Twilio. A successful benchmark synchronization never activates a country by
itself: a matching, current Telnyx provider rate or exact inventory price is
still required.

Voice benchmark lookup follows the globally longest matching E.164 prefix, not
the country label of the pricing endpoint. This is required for NANP: Twilio
publishes general `+1` pricing under US and can publish longer Canadian
exceptions separately. Equal-length benchmark conflicts use the lower price so
the comparison remains conservative.

Telnyx Global Conversational CSV imports are allowlisted to configured countries,
hashed, audited and replaced atomically per country. Non-numeric destination
patterns are rejected. When the rate deck contains origin-dependent prices, the
importer stores the maximum applicable cost for every destination prefix so a
call is never reserved using an optimistic carrier rate.

USD/MXN uses Banco de México SIE series `SF43718` (FIX). Each observation has a
bounded expiry and the 5% exchange-protection margin is applied only when converting the
USD customer amount into an MXN wallet charge. If Banxico or Twilio cannot be
verified before expiry, Easyhook fails closed instead of reusing stale data.

The internal synchronization routes are not customer API endpoints:

- `POST /internal/telecom/pricing/fx/sync`
- `POST /internal/telecom/pricing/benchmarks/sync`

They accept only the configured Cloud Scheduler OIDC identity or the existing
administrative token. Runs are audited without storing source credentials or
raw customer/provider payloads. Tavily or page monitoring may alert maintainers
about public pricing changes, but cannot write billable rates.

Production refreshes Twilio daily at 05:30 and Banxico daily at 18:30 in
`America/Monterrey`. The Telnyx voice CSV remains a manually verified import
because Telnyx does not document an accounting-grade rate-deck download API;
its bounded validity causes pricing to fail closed if no new deck is imported.

Before a carrier operation, Easyhook reserves its maximum estimated cost. For
inbound SMS/MMS the signed `message.received` callback creates the deterministic
reservation and its included carrier cost settles it immediately, because
Telnyx emits `message.finalized` only for outbound messages. Easyhook applies
the commercial rule, settles the exact amount and returns unused reservation
funds. Fractional-cent refunds accumulate instead of being rounded away. Calls
use provider cost/duration webhooks and a server-enforced maximum. A pending
outbound call that never reaches the provider releases its reservation after
two minutes; a late provider start is terminated and cannot revive the canceled
call. WhatsApp Calling reserves the requested maximum and settles rounded actual
minutes on termination. The ordinary Easyhook API-operation fee remains a
separate wallet entry.

Rent is charged in advance on calendar months. A purchase charges activation plus the prorated remainder of its UTC calendar month; subsequent renewals are due on the first day of every month. Renewal notices are emitted 7, 3 and 1 day before renewal. If renewal cannot be paid, usage is paused and the number enters a seven-day grace period. Only after grace expires does the provider release run; a failed provider release is retried and never marked complete locally first. Production runs `easyhook-telecom-renewals` daily at 06:15 `America/Monterrey`; Cloud Scheduler signs an OIDC request to `POST /internal/telecom/renewals/process` and the backend accepts only the configured service-account email and audience (or the existing administrative token for controlled operations).

Inbound Telnyx calls reserve a conservative maximum of 60 minutes before an
endpoint rings. The signed `call.cost` event supplies `total_cost` and
`billed_duration_secs`; Easyhook applies the voice commercial rule to that
authoritative amount and returns the unused hold. The call is not routed when
the wallet cannot cover the temporary maximum. Other providers remain
tariff-gated. This prevents Easyhook from silently extending carrier credit to
an empty wallet without pretending that the hold is the final price.

## Future adapters

Infobip and DIDLogic can implement the same adapter interface. A possible `easyhook` WebRTC provider may reuse the call resource later, but remains outside this release because it also requires TURN, native incoming-call UX, abuse controls and QoS operations.

## Required deployment configuration

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_CLIENT_STATE_SECRET` (at least 32 random characters; signs outbound dial authorization and must be stored in Secret Manager)
- `TELNYX_CALL_CONTROL_CONNECTION_ID`
- `TELNYX_CREDENTIAL_CONNECTION_ID` (a Credential Connection, not Call Control)
- `TELNYX_HUMAN_TRANSFER_SIP_DOMAIN` (the Telnyx SIP subdomain used only for signed ElevenLabs handoffs)
- `BANXICO_SIE_TOKEN` for official USD/MXN FIX series `SF43718`
- `TWILIO_PRICING_API_KEY` and `TWILIO_PRICING_API_SECRET`, restricted to the official Pricing API
- `TELECOM_PRICING_COUNTRIES` as an explicit ISO-country allowlist (initially `US,CA,MX`)
- A service-role-only `telecom_messaging_profiles` row for every tenant consent program; the Telnyx profile ID is stored there, never as a global Cloud Run variable
- Cloud Tasks queue and authenticated dispatch URL for durable routing leases, abandoned-start cleanup and maximum-duration termination
- `CLOUD_SCHEDULER_SERVICE_ACCOUNT_EMAIL` and `CLOUD_SCHEDULER_OIDC_AUDIENCE` for number renewals
- Meta app subscribed to `calls`, `whatsapp_business_messaging`, calling enabled on each eligible Cloud API number and a valid payment method for business-initiated calls
