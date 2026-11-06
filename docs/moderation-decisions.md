# Moderation decisions (statements of reasons)

EU Digital Services Act Art. 17 gives a user a statement of reasons for every restriction of their content or account. The moderation service (`pubky/pubky-moderation`, `checkstep-response-service`) records one decision per restriction. The app shows each to the user it concerns, with an appeal link, on the notifications page.

The wire format, the authentication and the fields are specified in the moderation service's `checkstep-response-service/docs/decisions-api.md`. This page covers the app's side.

## Flow

```
useModerationDecisions → ModerationDecisionController.fetchDecisions → ModerationDecisionApplication
  → ModerationDecisionService → HomeserverService.createCustomPop → fetch GET {origin}/v1/decisions
```

- `PUBKY_RUNTIME_MODERATION_DECISIONS_URL` (`moderationDecisionsUrl`, see [environment](environment.md)) names the service. Unset, nothing is requested and nothing is shown.
- The request carries `Authorization: Pubky-Pop grant=<JWS>, pop=<JWS>`. `HomeserverService.createCustomPop` signs `{ "aud": "pubky-moderation", "method": "GET", "path": "/v1/decisions" }` with the signed-in grant session (`session.grant.createCustomPop`). The proof names the user through the root-signed grant, so it works for a Pubky Ring sign-in, where the app never holds the user's key. A cookie session has no grant and reads nothing. The service accepts a grant only from a `client_id` it lists (`getAuthClientId()`: `pubky.app`, `staging.pubky.app`).
- Statements are optional: every failure (no service, no grant, an outage, a rejected proof, an odd body) is the value `unavailable`, logged but never reported. `ModerationDecisionService` follows `ClientRegionService`.
- A statement the build cannot read (an unknown restriction, a field that fails validation) is kept as a `null` entry, and `ModerationDecisionCard` shows it with the appeal route instead of dropping it.
- `useModerationDecisionStore` is memory only and keyed by `forPubky`, so another user signing in never sees the previous user's statements. A read is reused for a minute (`MODERATION_DECISION_FRESH_MS`); a failed refresh keeps what was already shown.

## What the card shows

`ModerationDecisionCard` gives every Art. 17(3) element: what was done (`restriction`), where and for how long, when, why and the ground (`ground`, `groundReference`, `explanation`), the facts and whether it followed a report, how automated means were involved, and how to contest it. The appeal is an email to `report@synonym.to` (the Terms' Complaint Procedure) with `Appeal <reference>` as the subject, plus the out-of-court and court options. The copy matches Pubky Market's card so users get one consistent notice. The restriction lines say only what moderation did: a removal deletes the post or profile record from our homeserver, and files attached to it may still be served on pubky.app (see [pubky-moderation#116](https://github.com/pubky/pubky-moderation/issues/116)); a tag restricts visibility and deletes nothing. A restriction that removes more, such as a Nexus takedown, needs its own restriction kind and card copy.

Not covered here: the report dialog elements of DSA Art. 16, a screen for an account the homeserver disabled (a disabled account cannot sign in again, so only a session that exists at that moment can read its statement), and reversing a decision an appeal upholds.
