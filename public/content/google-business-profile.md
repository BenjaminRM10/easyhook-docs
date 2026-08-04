# Google Business Profile reviews

Connect the Google account that manages a Business Profile, select one or more
locations, receive new or updated reviews, read the aggregate rating, and reply
publicly from Easyhook. Reviews remain separate from the messaging Inbox.

## Before connecting

Google applies two independent controls:

1. **OAuth verification.** Easyhook requests only
   `https://www.googleapis.com/auth/business.manage`. Before verification,
   authorized test users may see Google's “app not verified” warning.
2. **Business Profile API access.** The Google Cloud project must separately be
   approved for Business Profile APIs. Without this approval, OAuth can finish
   but review and location calls still fail or have zero quota.

The Business Profile must be verified and the Google user must have access to
the locations it selects. Easyhook never grants access to a location by itself.

Official setup references:

- [Business Profile API prerequisites](https://developers.google.com/my-business/content/prereqs)
- [Request API access](https://developers.google.com/my-business/content/basic-setup)
- [OAuth implementation](https://developers.google.com/my-business/content/implement-oauth)

## Connect locations

1. Open **Conectar > Google Business Profile**.
2. Sign in to Google and authorize Business Profile management.
3. Easyhook loads the accounts and locations available to that Google user.
4. Select the locations this organization may administer.
5. Open **Reseñas** to verify the rating and existing reviews.

One OAuth authorization may expose several locations. Easyhook creates one
tenant-isolated channel per selected location. A location cannot be active in
two Easyhook organizations at the same time.

## API

Use the connected location resource returned as `account.id` or by
`GET /v1/senders`:

```text
accounts/123/locations/456
```

| Goal | Method and path | Scope |
| --- | --- | --- |
| List reviews | `GET /v1/reviews?from=...` | `reviews:read` |
| Get rating | `GET /v1/reviews/summary?from=...` | `reviews:read` |
| Reply | `PUT /v1/reviews/{review_id}/reply` | `reviews:write` |

Complete requests and response fields are in [API reference](/api-reference#google-business-profile-reviews).

## Webhooks

Subscribe with provider `google_business_profile` and events:

- `review.created`
- `review.updated`
- `review.*`

Use organization scope for every selected location or channel scope for one
location. Easyhook receives Google Pub/Sub notifications, fetches the current
review, normalizes it, and signs delivery with the normal Easyhook HMAC.

Incoming review webhooks are free. API list, summary, and reply calls use the
normal Easyhook per-operation wallet charge.

## Google Cloud configuration

Enable these APIs in the same project used by the Business Profile OAuth app:

- My Business Account Management API
- My Business Business Information API
- Google My Business API
- My Business Notifications API
- Cloud Pub/Sub API

Use this OAuth redirect URI:

```text
https://api.easyhook.dev/v1/channels/google-business-profile/oauth/callback
```

Create one Pub/Sub topic and grant publisher access to:

```text
mybusiness-api-pubsub@system.gserviceaccount.com
```

Create a push subscription for that topic. Its endpoint must include the
verification token configured in Easyhook:

```text
https://api.easyhook.dev/v1/channels/google-business-profile/webhook?token=<GOOGLE_BUSINESS_PUBSUB_VERIFICATION_TOKEN>
```

Example with Google Cloud CLI:

```bash
gcloud pubsub subscriptions create easyhook-google-reviews-push \
  --topic="$GOOGLE_BUSINESS_PUBSUB_TOPIC" \
  --push-endpoint="https://api.easyhook.dev/v1/channels/google-business-profile/webhook?token=$GOOGLE_BUSINESS_PUBSUB_VERIFICATION_TOKEN"
```

Configure these Cloud Run secrets or environment variables:

- `GOOGLE_BUSINESS_OAUTH_CLIENT_ID`
- `GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET`
- `GOOGLE_BUSINESS_OAUTH_STATE_SECRET`
- `GOOGLE_BUSINESS_PUBSUB_TOPIC`, using `projects/<project>/topics/<topic>`
- `GOOGLE_BUSINESS_PUBSUB_VERIFICATION_TOKEN`, generated randomly with at
  least 32 bytes

Easyhook configures each authorized Business Profile account to publish
`NEW_REVIEW` and `UPDATED_REVIEW`. Customers do not configure Pub/Sub manually.
