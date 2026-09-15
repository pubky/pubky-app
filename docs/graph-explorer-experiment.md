# Graph Explorer experiment (`experiment/graph-viz`)

An experimental social-graph exploration feature spanning two branches:

- **franky** `experiment/graph-viz`: the `/graph` explorer page + a "Graph" feed layout.
- **pubky-nexus** `experiment/graph-viz`: the graph API it talks to.

## What you get

- **`/graph`** (top-nav Waypoints icon, or `/graph?user=<pubky>` deep link, public explore route): an ego-centric canvas of users, posts, and tags. Click = inspector panel (real post cards, reply-in-place, follow, social proof). Double-click = expand that node's neighborhood. Hover a user = profile card. Legend rows filter classes; controls hold declutter, communities (Louvain), the time machine, and physics pause/pinning. "How am I connected?" traces the shortest follow path with particles.
- **Edge colors carry data**: follows touching the focused user keep relationship colors (the legend palette); follows between neighbors fade by age (fresh = warm bright, old = gray); with communities on, intra-community edges take the community tint and bridges between communities stay bright neutral. Tag edges use their label's color, and their count chips are tap targets. The legend teaches this: a gradient row for follow age, plus community/bridge rows whenever communities mode is on, and hovering any of them spotlights the matching edges on the canvas.
- **Feed "Graph" layout** (left sidebar layout switcher on Home/Custom/Search, desktop): renders the current stream as a constellation. Authors carry their posts, replies/reposts draw lineage chains, the stream's hottest tags become hubs. "Merge more" grows the graph a page at a time; the time machine replays the feed assembling.

## Backend endpoints (nexus)

- `GET /v0/graph/{kind}/{id}` with `kind` in `user|post|tag`; params `depth` (1..2, user centers only), `limit` (1..50, default 30), `kinds` csv filter. Node ids are prefixed (`user:{pubky}`, `post:{author}:{post_id}`, `tag:{label}`); FOLLOWS/TAGGED edges carry `indexed_at`.
- `GET /v0/graph/path/{from}/{to}`: undirected shortest FOLLOWS path, max 6 hops, nodes path-ordered.
- `nexusd db reindex`: rebuilds the Redis index from the Neo4j graph (flushes Redis first; connection settings from `config.toml` in the config dir). You need this once after restoring a graph backup, or feed streams come back empty.

## Running it locally against a production clone

1. Check out both `experiment/graph-viz` branches.
2. Restore a Neo4j backup into the compose volume (`docker/.database/neo4j/data`; stop the container first, `chown -R 7474:7474` after extracting). Set the backup's password in `~/.pubky-nexus/config.toml` AND `~/.pubky-nexus/migrations/config.toml`.
3. `cargo run -p nexusd -- db reindex` (populates Redis), then `cargo run -p nexusd -- api` (port 8080).
4. In franky `.env`: `NEXT_PUBLIC_NEXUS_URL=http://localhost:8080` and make sure `NEXT_PUBLIC_PKARR_RELAYS` is the JSON-array form.
5. `npm run dev` and open `/graph?user=<any pubky in the clone>`.

For the mock dataset instead: `cargo run -p nexusd -- db mock`, then use the fixture user `4snwyct86m383rsduhw5xgcxpw7c63j3pq8x4ycqikxgik8y64ro`.

## The two-minute demo

Sign in, switch Home to Following, flip the layout to Graph, hit the time machine's play button and watch the week assemble. Then open `/graph`, double-click a friend, hover people, select a post and reply to it from the panel, and hit "How am I connected?" on a stranger.

## Tests

- Nexus: `cargo nextest run -p nexus-webapi` (needs the mock dataset loaded; 13 graph tests among 508).
- Franky: `npm test` (synthesizer, hooks, canvas, chrome all covered); `cypress/e2e/graph-public.cy.ts` runs against a live stack.
