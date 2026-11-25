# ADR 0031: The Local Index as a Read Source

## Status

Proposed - 2026-11-25

## Context

Every remote read the app makes for social data goes to Nexus, one central indexer. A deploy without a Nexus, or a
user who does not want to depend on one, has no app. The homeservers already serve everything Nexus indexes: each
user's public event stream and files. A browser can crawl the signed-in user's social scope (their follows and two
hops out, with a window of recent activity) and answer most of the app's reads from it.

`src/libs/indexer/` is that crawler and query layer. It imports nothing from the app and never touches the SDK: it
takes an injected transport, keeps its own IndexedDB database, and answers a Nexus `/v1` request in Nexus's response
shape. What it cannot answer (global search, global rankings) it rejects as unavailable, and an answer over partly
loaded history names what could be loaded to extend it.

The app's Nexus reads funnel through one function, `queryNexus`, and every Nexus URL is built by `buildNexusUrl`, so
the read boundary and the `*.fromNexus` mappers behind it can stay as they are.

## Decision

A runtime setting, `PUBKY_RUNTIME_INDEXER_SOURCES`, names where Nexus reads are answered, in order: `nexus` (the
default, today's behavior), `local`, or `local,nexus`. Without `nexus` the Nexus and CDN URLs may be left unset.

- **Transport.** `createIndexerTransport` (`src/core/services/indexer/`) implements the library's transport over
  `HomeserverService`, which stays the only holder of the SDK client. The crawl's reads are anonymous: a batched,
  non-live `/events-stream` page through `client.fetch` (for the reason `subscribeUserEventStream` gives), PKARR
  lookups and public files, each bounded by `INDEXER_READ_TIMEOUT_MS`. Their failures are routine for a crawl over
  homeservers other people run, so they carry dedicated operations that a Sentry drop rule matches.
- **Lifecycle.** `IndexerService` owns one `SocialIndexer` per tab, in a database named by the account's key, with
  cross-tab coordination so one tab crawls. `IndexerCoordinator` (started by `CoordinatorsManager`) starts it when a
  session enters the auth store, which is after the migration gate and before the profile bootstrap, stops it when
  the session leaves and pauses it with the tab. Sign-out deletes its database next to the app's own.
- **Routing.** `queryNexus` asks the local index first when `local` is a source. A 200 returns its JSON; a 404 raises
  the error a Nexus 404 raises, without the Nexus 404 retry budget; an unavailable read raises a non-retryable 422.
  Both misses are expected outcomes and stay out of Sentry. A 404 the index cannot vouch for, or an answer about one
  post or user, that names something to load gets one load and one more ask. With `local,nexus`, an unavailable read
  or an unproven 404 goes on to Nexus. Local answers bypass the Nexus transport cache and carry no response start
  stamp: they reflect the index's last sync, not the time of the call.
- **Media.** Without `nexus` there is no CDN. The two media URL builders (`filesApi.getAvatarUrl`,
  `filesApi.getFileUrl`) return same-origin paths under `/_pubky/`, so components, the persisted file rows and the
  avatar URL parser keep working with strings. The service worker answers them: from its own bounded cache, or with
  the bytes it asks a controlled page for over a `MessageChannel`, since only the page holds the SDK client. The page
  reads the file through `HomeserverService.getPublicFileBytes`, and an avatar through the image of the profile in
  the index's view. The avatar URL keeps the profile version, so a new avatar is a new cache entry; sign-out deletes
  the cache with the index database (`docs/pwa.md`, _Local media_).
- **Freshness.** Every owned write lands through `HomeserverService`, which now tells subscribers the path written;
  `IndexerService` refreshes the account after each public write. Each change of the index marks every cached post
  stream dirty (`postStreamDirtyRegistry`, scope `local_index`), so a stream rebuilds on its next initial load and
  mounted feeds keep their position.

## Consequences

### Positive ✅

- The app runs against homeservers alone, or uses Nexus only for what a local index cannot answer.
- With the default setting nothing changes: `queryNexus` takes the Nexus path before touching the index.
- The library stays independent of the app and the SDK, so it can be tested and reused on its own.

### Negative ❌

- A signed-out visitor has no local index: with `local` alone every read is unavailable.
- Global search, rankings and hot tags need Nexus.
- The first sync of a new device crawls the whole scope before the first answer, and the sign-in bootstrap waits for
  it.
- Without Nexus there are no resized variants: feeds and thumbnails load the original file. Media shows only in a
  page the service worker controls, so the first visit before the worker activates, a hard reload and a dev build
  without the worker show fallbacks.

### Neutral ⚠️

- Counts, rankings and reverse edges are correct for the crawled scope, not globally.
- One more IndexedDB database per account, deleted on sign-out.

## Alternatives Considered

### A second read path beside `queryNexus`

Each Nexus service would call the index directly. Every service would need two code paths and the read boundary
would be duplicated; routing in the one function keeps the services unchanged.

### Media through a server route

A Next.js route could fetch homeserver files for the browser, but that makes the app server a central media proxy,
the role this setting removes. The worker keeps every read in the browser.

### Running the index in a service worker

One crawler per browser instead of per tab, but the service worker cannot hold the session and has no stable
lifetime. Cross-tab locking gives one crawler per browser without it.
