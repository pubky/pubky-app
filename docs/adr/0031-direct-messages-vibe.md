# ADR 0031: Direct Messages (Vibe)

## Status

Proposed, 2026-11-19. Experimental: lives on the `vibe/dms` branch of a fork and is listed on vibes.pubky.app.

## Context

Users want private one-to-one conversations next to the public timeline, the way X has Messages.
[pubky-messenger](https://github.com/coreyphillips/pubky-messenger) already defines end-to-end
encrypted messages stored on each sender's homeserver, but its protocol (v1) derives every
conversation key from both participants' identity secrets. Pubky App signs in with Ring, Bitkit or
Passport grants and never holds the identity secret (ADR 0024), so v1 cannot run here.

Pubky grants can deliver scoped content keys: a capability with the `e` action, requested through a
signed approval (`approvalFormat: "signedApprovalV1"`), makes the signer derive a key for a path from
the identity secret and hand it to the app. The derivation is deterministic, so every device approved
for the same path gets the same key.

## Decision

- Use pubky-messenger **protocol v2** through `pubky-messenger-ts` (pinned git dependency). v2
  derives a messaging keypair from the scoped key for `/priv/private_messages/v2/messaging-key`,
  publishes its public half at `/pub/private_messages/v2/key.json`, and stores messages under
  `/pub/private_messages/v2/{conversation}/` on the sender's homeserver. See `PROTOCOL-v2.md` in
  pubky-messenger-ts.
- Request `DM_CAPABILITIES` (`/pub/private_messages/:rw`, `/priv/private_messages/v2/messaging-key:e`)
  only through the Messages upgrade (`AuthController.requestCapabilities`), never at sign-in. Any flow
  whose capabilities contain `e` uses a signed approval (`GrantFlowService.start`); the rest stay bare
  grants, so a signer without `af=v1` support still signs in.
- These paths are spelled by hand. They are pubky-messenger's protocol, not a `pubky-social-specs`
  object, which is a deliberate exception for this experiment.
- Keep messages in a separate IndexedDB database (`pubky-app-dms`) keyed by account. The shared
  `DB_VERSION` does not change. Logout clears it.
- Poll, because a homeserver has no inbox (`MessagesCoordinator`): the open thread every 5 s, known
  conversations every 30 s, and up to 200 follows and followers every 3 min for new conversations.
  A conversation started by someone the owner does not follow is a request until the owner replies.

## Consequences

- Messaging needs a Pubky Ring build with encryption approval (pubky/pubky-ring#387). Signers
  without it can still use the rest of the app.
- A revoked grant cannot take back a delivered messaging key. Rotation needs a new key path.
- The key record is bound to the identity by homeserver write authority: a compromised homeserver
  could substitute it. No safety-number check exists yet.
- Discovery only finds conversations with follows and followers; a stranger appears once the owner
  opens their thread.
- Conversation directory names, message counts, sizes and timestamps are public; contents and
  senders are encrypted. There is no forward secrecy.
- Out of scope: media, group messages, reactions, typing indicators, read receipts.
