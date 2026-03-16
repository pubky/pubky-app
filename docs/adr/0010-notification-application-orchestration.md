# ADR 0010: Notification Application Cross-Domain Orchestration Privilege

## Status

Accepted — 2025-12-06

## Context

Notifications are cross-domain entity aggregations. Each notification references entities from multiple domains:

- **Posts**: replies, reposts, mentions, tag posts, edited/deleted posts
- **Users**: followers, friends, taggers, repliers, reposters, mentioners

When fetching notifications from Nexus, referenced posts and users must be hydrated into the local cache **before** persisting notifications.

ADR-0009 restricts orchestration privilege to `PostApplication` and `UserApplication`. However, `NotificationApplication` legitimately requires cross-Application calls for entity pre-fetching.

## Decision

**Extend the orchestration privilege (ADR-0009) to include `NotificationApplication`.**

This ADR amends ADR-0009 rule #4 with a scoped exception: `NotificationApplication` is an allowed orchestrator only for pre-persistence read hydration.

`NotificationApplication` MAY call:

- `PostStreamApplication.fetchMissingPostsFromNexus()`
- `UserStreamApplication.fetchMissingUsersFromNexus()`

Constraints:

1. **Read-only hydration**: Only fetch/read operations permitted—no writes to post or user domains
2. **Pre-persistence only**: Cross-Application calls must occur before persisting notifications
3. **No reverse dependencies**: `PostStreamApplication` and `UserStreamApplication` MUST NOT call `NotificationApplication`
4. **Max depth 1**: Standard ADR-0009 depth rule applies

## Consequences

✅ Ensures UI renders complete notification data (no missing entities)  
✅ Formalizes existing implementation pattern  
⚠️ Adds third orchestrator to review checklist (Post, User, Notification)

## Related Decisions

- [ADR-0009: Application Cross-Domain Orchestration](0009-application-cross-domain-orchestration.md)
