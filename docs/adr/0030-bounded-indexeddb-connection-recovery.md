# ADR 0030: Bounded IndexedDB Connection Recovery

## Status

Accepted — 2026-11-12. Amends decision 2 of [ADR-0011](0011-dexie-psd-and-tanstack-query.md) only for the database primitive described below; the other decisions remain unchanged.

## Context

WebKit can reject a local read or abort a local transaction after initialization while Dexie still considers its native connection open. Reporting immediately leaves local data unavailable until a later connection is opened. Reconnecting from a hook or replaying arbitrary writes would break the local-first and transaction guarantees in ADR-0011.

Dexie also wraps non-connection transaction failures in `AbortError`, with the actual error in `inner`. The outer name alone therefore cannot distinguish a quota failure from the connection failures this recovery targets.

## Decision

Allow `withIndexedDbRecovery` in the database layer to share one reconnect for a failed native connection and replay each eligible operation at most once. Eligible operations are a local read or a complete local-only transaction whose failure has rolled back all writes. A replay reruns the entire transaction, including its reads and revision/session guards. Never replay an individual write, a statement inside a caller-owned transaction, or work with network, store or other external side effects.

The current callers are `ModelBase` reads and complete local-only transactions in `LocalTagCacheService`. `BaseStreamModel` reads and custom model readers that bypass `ModelBase` remain outside this recovery scope; extending coverage requires its own transaction and observation checks.

Schedule exactly one connection-transition task with the public `Dexie.asap`, inside a Dexie promise, before closing. Dexie 4.4.7 uses `setImmediate` where available and `setTimeout(0)` otherwise. This task boundary lets admitted caller transactions finish their queued native-transaction creation before the shared handle closes; a microtask yield alone can still close between Dexie's readiness check and transaction creation. Recheck connection and lifecycle ownership inside the task, then close and initiate reopening synchronously. This is the only task-scheduling exception: no timer loop, backoff, network call, TanStack Query operation or hook-level retry is permitted.

A shared reconnect promise must be wrapped in each caller's Dexie scope so independent live queries retain their own observations across the task. Caller-owned transaction callbacks are neither intercepted nor replayed.

Only structured `UnknownError` and `AbortError` failures are eligible. For a Dexie abort with an `inner` error, inspect that cause instead; quota, constraint, schema and other non-connection errors must propagate without reconnecting. Preserve the existing bounded fallback for an abort with no available inner cause: production Sentry reports include raw aborts, but do not expose enough detail to classify every missing cause as intentional. Error-message matching is not added.

An actual Dexie `BulkError` or `ModifyError` is eligible only when its public `failures` array contains at least one failure and every nested failure is connection-eligible under the same rules. Mixed quota, constraint or programming failures, empty aggregates and cyclic causes remain ineligible. Repeated references to the same failure are allowed. Aggregate classification does not make a partial write safe to replay: the enclosing local-only transaction must have rejected and rolled back every write first.

Recovery only reopens an existing database. A temporary `populate` handler aborts any creation transaction during reconnect and is removed before normal initialization can run. If the database is missing, reopening fails without replaying the operation. The resulting non-recovery-owned close lets `DatabaseProvider` run normal initialization, detect the missing database and record `wasDbReset` for the existing migration resync flow.

Every close outside the recovery-owned synchronous close, and the start of account cleanup, invalidates pending recovery. Cleanup suspends recovery until all overlapping clears finish. Recheck ownership before replay; a later open must not revive stale work. Recovery never replaces a connection it reopened while a caller of that reconnect is still replaying: a fresh failure on that connection in the meantime propagates without recovery. Only a recoverable connection error during replay fences that reopened connection against subsequent reconnects during the same recovery lifetime. Quota, constraint and programming errors propagate without installing or clearing that fence; otherwise eligible connection failures can recover once all pending replays settle. An unrelated close or account cleanup resets that lifetime.

The model or service remains the single terminal `Err.database` reporting boundary. If reopening fails, retain the original operation error and attach the open failure as its cause. Do not delete data, change the schema or reduce visible behavior as part of recovery.

## Consequences

- Transient stale-connection failures can recover while mounted pages and live-query observations remain intact.
- Whole-transaction replay preserves rollback, reread and session/revision checks; arbitrary writes remain ineligible.
- The shared connection requires explicit lifecycle and replay-failure fences. Tests must cover concurrent observers, caller transactions, nested abort causes, cleanup, external closes, missing databases, failed reopening, replay failure classification and a fresh failure that overlaps an unfinished replay.
- Browsers may throttle the single transition task while a tab is backgrounded. Operations wait for it; cleanup or an external close while it is pending still invalidates recovery.
- A fresh failure on a reopened connection is not recovered while an earlier replay on it is unfinished; it reports through the usual boundary.
- An abort without an exposed cause can still incur one unsuccessful reconnect; a recoverable connection error during replay fences later operations against a reconnect cycle on that connection.

## Alternatives

- **Report every runtime failure:** simpler, but does not recover the observed stale native connection.
- **Retry in hooks or TanStack Query:** rejected because timers/network orchestration can escape Dexie's observation scope and duplicate retries across callers.
- **Replay arbitrary writes or recreate the database:** rejected because partial/external effects cannot be safely replayed and recovery must not erase local data.

## Related Decisions

- [ADR-0011: Dexie PSD and TanStack Query](0011-dexie-psd-and-tanstack-query.md): narrow amendment to the blanket retry prohibition; all other boundaries remain.
- [ADR-0019: Recreate Dexie Database on Version Mismatch](0019-dexie-recreate-on-version-mismatch.md): schema recreation remains a separate initialization decision.
