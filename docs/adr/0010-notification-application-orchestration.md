# ADR 0010: Notification Application Cross-Domain Orchestration Privilege

## Status

Accepted — 2025-12-06

## Context

Notifications are cross-domain entity aggregations. Each notification references entities from multiple domains:

- **Posts**: replies, reposts, mentions, tag posts, edited/deleted posts
- **Users**: followers, friends, taggers, repliers, reposters, mentioners

When fetching notifications from Nexus, referenced posts and users must be hydrated into the local cache **before** persisting notifications.

[ADR-0009](./0009-application-cross-domain-orchestration.md) defines which Applications may call other Applications. `NotificationApplication` needs that privilege for entity pre-fetching, but with tighter constraints than general orchestrators (network reads with local cache persistence, before notification persistence only).

## Decision

**Include `NotificationApplication` as an allowed orchestrator under ADR-0009 rule #4, scoped to network-read cache hydration before notification persistence.**

The canonical allowlist lives in ADR-0009. This ADR defines the **extra constraints** that apply when `NotificationApplication` uses that privilege.

`NotificationApplication` MAY call:

- `PostStreamApplication.fetchMissingPostsFromNexus()`
- `UserStreamApplication.fetchMissingUsersFromNexus()`

Constraints:

1. **Network-read cache hydration only**: Nexus reads and local post, file, and user cache persistence are permitted; homeserver writes and user-authored domain mutations are not
2. **Pre-persistence only**: Cross-Application calls must occur before persisting notifications
3. **No reverse dependencies**: `PostStreamApplication` and `UserStreamApplication` MUST NOT call `NotificationApplication`
4. **Call depth**: The ADR-0009 attachment-persistence exception permits `NotificationApplication` → `PostStreamApplication` → `FileApplication`; no other depth-2 path is permitted

## Consequences

✅ Ensures UI renders complete notification data (no missing entities)  
✅ Formalizes the hydration-before-persist pattern  
⚠️ Reviewers must check Notification’s scoped constraints in addition to the ADR-0009 allowlist

## Related Decisions

- [ADR-0009: Application Cross-Domain Orchestration](0009-application-cross-domain-orchestration.md)
