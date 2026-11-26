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
  cross-tab coordination scoped by that name so one tab per account crawls. `IndexerCoordinator` (started by
  `LocalIndexManager`, outside the route guard, whose spinner unmounts `CoordinatorsManager` while the account is
  prepared) starts it when a session enters the auth store, which is after the migration gate and before the profile
  bootstrap, or as soon as a saved session starts restoring, so a reload reads what the account's index stored; it
  stops it when the session leaves, behind the gate or after a failed restore, and pauses it with the tab. Only the
  saved index file needs the session: one that could not be read at start is read again after the next sync. Sign-out deletes its database
  next to the app's own. Without `local` among the sources, the coordinator only deletes, best effort, the database an
  earlier `local` deploy left for an account that signs in.
- **Routing.** `queryNexus` asks the local index first when `local` is a source. A 200 returns its JSON; a 404 raises
  the error a Nexus 404 raises, without the Nexus 404 retry budget; an unavailable read raises a non-retryable 422.
  Both misses are expected outcomes and stay out of Sentry. An answer that lacks a post or user it names (a `by_ids`
  read, the stream of an author not loaded, an unproven 404) gets one load of it and one more ask; older history is
  loaded that way only for a 404 the index cannot vouch for or an answer about one post or user. A post stream page
  differs, because the stream layer reads a page shorter than its `limit` as the end of the feed, as Nexus means
  it. The index names an author's older history on a page only when an older post of theirs could join it: the page
  is short, or it would continue past what is loaded for them. A page bounded by `end` (a head poll) is never
  extended, whatever its answer names: it asks for posts newer than a score, and a timer must not force crawls. A page that comes back short while its answer names such authors gets one forced step of that history for at
  most `INDEXER_PAGE_BACKFILL_AUTHORS` of them per round, those whose loaded history starts latest, and is asked
  again, round after round, until it is full. Each step resolves once the index's answers hold it and says whether it
  ran, how many events it read and whether the history now reaches the author's first event. An author leaves the
  extension once complete, or once a step of theirs was skipped, failed or read nothing; the page is served short,
  ending the feed, once no named author is left. `INDEXER_PAGE_BACKFILL_MAX_ROUNDS` (20) caps the rounds as a safety
  net. There is no wall-clock budget: the stream layer reads only the page length (`reachedEnd: rawPageIds.length <
  limit`) and has no way to say short but not ended, so a page cut short by time would end the feed with older posts
  still to load. A step's time is bounded by its size (one page of `backfillPageLimit` events) and the transport's
  request deadlines. A full page is served as it came, so the first page
  of a feed waits on nothing it does not show. The wait shows as the feed's loading-more state. Only the author streams and Following name older history; the All, friends and web of trust
  feeds end at the loaded window. With `local,nexus`, an unavailable read
  or an unproven 404 goes on to Nexus. Local answers bypass the Nexus transport cache and carry no response start
  stamp: they reflect the index's last sync, not the time of the call.
- **Media.** Without `nexus` there is no CDN. The two media URL builders (`filesApi.getAvatarUrl`,
  `filesApi.getFileUrl`) return same-origin paths under `/_pubky/`, so components, the persisted file rows and the
  avatar URL parser keep working with strings. The service worker answers them: from its own bounded cache, or with
  the bytes it asks a controlled page for over a `MessageChannel`, since only the page holds the SDK client. The page
  reads the file through `HomeserverService.getPublicFileBytes`, and an avatar through the image of the profile in
  the index's view. The avatar URL keeps the profile version, so a new avatar is a new cache entry; sign-out deletes
  the cache with the index database (`docs/pwa.md`, _Local media_). The worker makes the resized image variants
  itself, to the widths and fit rule of the Nexus CDN, from the one cached original, so feeds do not download
  full-size uploads. It answers byte ranges from the cached file, which Safari needs to play video and audio, and
  refuses files over 100 MiB, the v1 file limit, since a first read holds the whole file in memory. The page refuses
  such a file before reading it, from its stated length or as soon as the bytes read pass the limit, and the worker
  waits longer than the page's media read deadline, which is longer than a record read's.
- **Server.** The Next.js server has no index: without `nexus`, page metadata, mention names and preview images
  (`fetchWithValidation`, the mention lookup) make no request and render the generic fallback a failed fetch
  renders. A Nexus URL built without a configured one gets the origin `https://nexus.invalid`, which never resolves
  and which the local index ignores, and `fetchNexus` refuses to send anything without the source, so no stray
  request can reach the app's own origin.
- **Freshness.** Every owned write lands through `HomeserverService`, which now tells subscribers the path written;
  `IndexerService` refreshes the account after each public write. A change of the index marks dirty the cached post
  streams it can reach (`postStreamDirtyRegistry`), so a stream rebuilds on its next initial load and mounted feeds
  keep their position: posts or tags mark every stream (scope `local_index`), follows alone mark the graph-shaped
  ones (`follow_graph`, `friends`), a profile alone marks none. Cached user lists have no dirty registry and refresh
  on their own TTL as before.
- **First answer.** The index answers once the seed's profile and follows are loaded, before its own posts and
  before its first full sync; nothing in
  sign-in or bootstrap waits for that sync. During it the bootstrap says `indexed: false`, which with the `local`
  source means the index is still syncing: the bootstrap neither tells Nexus to ingest nor schedules its retry, and
  the feeds fill in through the invalidation above. An empty Home says the network is loading
  (`LocalIndexFeedEmpty`) and loads again when the first sync ends; a Home already showing posts keeps its place and
  the stream coordinator polls its head as soon as that sync ends, rather than an interval later.
- **Visitors.** Without a session the coordinator runs a visitor index (`start(null)`) in its own database (behind
  the migration gate it runs none, since every page shows the gate): no scope,
  no saved index, no tab coordination. Shared post and profile links render from what it loads on demand, through
  the same `more` hints. A post loads with its author's profile in one batch of leaf reads, and the posts it replies
  to or quotes start loading as soon as it lands, so a shared post costs one lookup per author and the thread the
  page asks for next is already on its way. Starting an account's index deletes the visitor's. With `local` as the only source a
  visitor's Home, Hot and Search show a join prompt instead of a feed nothing can answer; sidebar rankings and
  suggestions answer empty.
- **Mutes.** The account's muted users go to `setExcluded` from a Dexie live query on the local muted stream, where a
  mute, its rollback and the homeserver poll all land.
- **Saved index.** On for accounts: the index keeps a file per device under `/priv/app.pubky/v1/index/`, inside
  `SOCIAL_V1_APP_CAPABILITIES`, so another device starts warm. The file is not encrypted yet. The SDK can deliver
  path-scoped content keys (`EncryptionKeys.deriveCryptoKeyForPath`) for scopes granted with the `e` action in a
  signed approval; sealing the file means requesting `e` on that path in every grant, keeping the keys for the
  session, and passing a sealer to the indexer.
- **Freshness stamp.** Local answers carry `asOf`, when the last scope sync ended. They still get no response start
  stamp: the tag guards read a stamp as proof that the snapshot holds every event before it, and `asOf` is not that,
  since a homeserver that failed or backed off during the sync, and anything loaded on demand, can be older.
- **Visibility.** With `local` among the sources the privacy settings page shows the index's live status (state,
  users per hop, homeservers reached and failed, request counts, last sync, first sync, saved index) and a sync
  button. Sidebar rankings and suggestions answered by the index (hot tags, active users, who to follow) carry an
  "In your network" hint, decided by the sources and the session rather than per response (`useLocalScopeHint`).
  Counts that range over reverse edges carry the same hint without changing layout: a tooltip on the number
  (`HintTooltip`) and the hint appended to the accessible name (`withLocalScopeHint`). They are a post's tag, reply
  and repost counts (`PostActionsBar`), a tag chip's tagger count (`PostTag`, through the `Tag` atom's `countHint`),
  and a profile's follower, friend and tagged counts (`ProfilePageFilterBar`, the own profile header). Following
  counts are left unmarked: a user's follows are their own file, which the index reads whole.

## Consequences

### Positive ✅

- The app runs against homeservers alone, or uses Nexus only for what a local index cannot answer.
- With the default setting nothing changes: `queryNexus` takes the Nexus path before touching the index.
- The library stays independent of the app and the SDK, so it can be tested and reused on its own.

### Negative ❌

- A signed-out visitor's index has no network: with `local` alone the explore feeds prompt to join.
- Global search, rankings and hot tags need Nexus.
- Without Nexus a shared link previews with the generic title, description and image.
- Until the first sync of a new device ends, feeds show a partial network; a device with a saved index from another
  one starts from it.
- Without Nexus the worker resizes images on the device, from an original that each device downloads once. Media
  shows only in a page the service worker controls, so the first visit before the worker activates, a hard reload and a dev build
  without the worker show fallbacks.

### Neutral ⚠️

- Counts, rankings and reverse edges are correct for the crawled scope, not globally. The sidebar rankings and the
  main post and profile counts say so; the follower counts in user lists and popovers, and post and reply totals
  limited by the activity window, carry no hint yet.
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
