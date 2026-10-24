# Pubky App + Locks: local stack runbook

This runbook explains how to run pubky-app on your machine against a local Locks stack. The stack has Lock Server,
Paykit Server, a Pubky homeserver testnet and a regtest Bitcoin chain. There is no real Bitkit wallet locally, so you
act as Bitkit from the terminal: you approve the creator's Paykit setup, you receive the reader's payment request, and
you pay it with `bitcoin-cli`.

**Version contract checked on 2026-10-19.** Since #2849 the app at `d061f40f8` installs Locks SDK
`0.1.0` from npm (Locks tag `v0.1.0`, commit `ac8e893b`). Apart from lock deletion, which the app does not
call, its requests are the ones introduced at `c692fb70522c` (`GET /creator/paykit/setup-status?asset=BTC`), which the stock rc9 Lock Server
rejects. This runbook still pairs the app with the Lock Server built from `c692fb70522c` and Paykit
rc9: that is the last pairing anyone ran end to end. Lock Server `v0.1.0` depends on the stable
`paykit-lib` 0.1.0 and `pubky` 0.16.2, so running it against Paykit rc9 is unverified (section 13,
issue 9). Section 3 pins the source revisions; section 4 uses them for the images and local helper
checkout.

The original 2026-10-08 notes reported a full rc9 payment/unlock flow with local helper workarounds.
That is not a fresh-stack validation of the recipe below. The helper gaps remain marked **Needs fix /
to confirm** in section 13; this runbook does not supply those missing helpers. The revised version
pairing is checked against source, and the reset SQL against a disposable database. Local stack startup,
account registration, Ring/Bitkit approvals and payments still need a live pass.

---

## 0. Conventions

1. Repositories are cloned under `~/dev/synonym/`: `locks`, `paykit-server`, `pubky-app`, `pubky-nexus`.
2. For a new stack, run commands from the pinned Locks worktree created in 4.1:
   `SRC="$HOME/dev/synonym/locks-local-build"`, then `cd "$SRC/locks"`. It owns the Compose file,
   helper scripts and `.local/` state. Keep this directory between runs. An existing stack must keep
   its original Compose directory and `.local/` state; update that clean checkout to the same source
   pin instead of starting another directory against the same Compose project.
3. Helper alias used below:
   ```bash
   dc() { docker compose -f compose.paykit-local-demo.yaml "$@"; }
   ```
4. In this runbook, "creator" is the account that publishes a lock. "Reader" is the account that pays for the lock.
   In the `locks` repository, the reader role is called `content-viewer`.

---

## 1. What runs

All Locks services run in one Docker Compose project (`pubky-locks-paykit-demo`). Nexus and pubky-app run on the host.

| Service                      | Where                | Port on 127.0.0.1                                                           | Purpose                                                              |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pubky-testnet`              | Docker               | 6286 (homeserver HTTP), 15411 (pkarr relay), 15412 (HTTP relay), 6881 (DHT) | Identities, homeserver, relays                                       |
| `locks-server`               | Docker               | 3000                                                                        | Lock Server (`/readyz` is the health check)                          |
| `paykit-server`              | Docker               | 3001                                                                        | Derives payment addresses, sends payment requests, watches the chain |
| `postgres`                   | Docker               | —                                                                           | Lock Server database (`locks_test`)                                  |
| `paykit-postgres`            | Docker               | —                                                                           | Paykit database (`paykit`)                                           |
| `bitcoin`                    | Docker               | —                                                                           | Bitcoin Core in regtest mode, with a `miner` wallet                  |
| `fulcrum`                    | Docker               | 60001                                                                       | Electrum indexer. Paykit uses it to see payments to an address       |
| `homegate-bridge`            | Docker               | 6288                                                                        | Only needed for sign-up through the app. Can stay stopped            |
| `nexusd` + `redis` + `neo4j` | Host (`pubky-nexus`) | 8080                                                                        | Indexer for feeds and profiles                                       |
| pubky-app                    | Host                 | 4000                                                                        | The app (port 3000 is taken by Lock Server)                          |

All Locks containers share the network namespace of `pubky-testnet`. This is why every port is published by the
`pubky-testnet` container.

One-off jobs (`compose-bootstrap`, `bitcoin-bootstrap`, `electrum-readiness`, `paykit-config`, `demo-config`) run once
and stay in the `exited` state. That is normal.

### How a paid unlock works

1. The creator signs in to Lock Server and connects a Paykit account (Bitkit approval). After that, the creator can
   publish a paid lock in the app.
2. The reader presses **Unlock** in the app. The app submits a proof bundle to Lock Server and gets the status `pending`.
3. Lock Server asks Paykit for an invoice. Paykit derives a new address from the creator's account.
4. Paykit sends a payment request to the reader's Bitkit over an encrypted (Noise) link between the two.
5. Bitkit accepts the request and pays the address.
6. Paykit sees the payment through Fulcrum. Lock Server sees that the request is accepted and the amount matches,
   and marks the task `completed`. The app unlocks the content.

Locally, the `examples/js-sdk` commands of the `locks` repository do the Bitkit part of steps 1, 4 and 5.

---

## 2. Rules that protect the stack

Each rule below comes from an incident that destroyed local data or blocked work for hours.

1. **Never run `docker compose up -d <one service>` on a running stack.** Compose recreates the dependencies too,
   including `pubky-testnet`, and the homeserver data is lost. To restart one service, use `docker restart <container>`.
   To recreate services, use `up -d --no-deps --force-recreate` and name every service you mean.
2. **Always set `LOCKS_CREATOR_DEMO_PORT=8090`** on `up` commands. The default port 8080 conflicts with Nexus.
3. **Do not restart or recreate `pubky-testnet` unless you must.** With homeserver v0.15, every start creates a new
   empty database: all accounts, profiles, lock files and Paykit markers are gone. Section 8 explains the recovery.
4. **Do not use `docker compose start` or `up` for `paykit-server` after you fixed its config.** Compose runs the
   `paykit-config` job again, and that job overwrites `.local/paykit-config/config.toml` with a template that rc9
   rejects. Use `docker stop` / `docker start pubky-locks-paykit-demo-paykit-server-1`.
5. **Do not keep the `reader-demo` container running while you use the reader commands.** It runs its own reader
   worker on the same reader state, and two readers on one state break the payment link.
6. **Do not rebuild images from your `locks` checkout** (`docker compose build`, `up --build`). That builds whatever
   version is checked out and replaces the images from section 4.
7. **Never run `docker compose down -v`.** It deletes the Lock Server identity volume.
8. **Run only one reader `receive` at a time** (section 10).

---

## 3. Prerequisites and versions

Tools: Docker, Node 22 or newer for the `locks` scripts (pubky-app itself needs Node 24, see its `.nvmrc`), `git`. The build needs internet access, because it builds paykit-server, paykit-rs
and the homeserver from their public Git repositories.

**Disk space:** keep at least 10 GB free on the host before you build. If the host disk fills up during a build, the
build fails and the Docker VM can become read-only (section 12). To free space, use `docker builder prune -af`
(section 4.5). Never delete volumes.

Use these exact revisions together. The app dependency's `rc9` version prefix alone is not a
compatibility check; its source suffix matters.

| Component          | Version                                                                  | Image tag that Compose uses                    |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Lock Server        | locks `c692fb70522cf75025b86ad72a3b98fa7ef84e72` (SDK source, Locks #75) | `pubky-locks-paykit-demo-locks-server:latest`  |
| Paykit Server      | paykit-server `v0.1.0-rc9` with paykit-rs `v0.1.0-rc71`                  | `pubky-locks-paykit-server:local`              |
| Homeserver testnet | pubky-homeserver `v0.15.0`                                               | `pubky-locks-paykit-demo-pubky-testnet:latest` |

Why these versions:

1. The rc9 Pubky SDK uses the homeserver write-lock API. Homeserver v0.11 fails with `acquire Pubky write lock`.
2. The matching Lock Server accepts the SDK's denomination-aware setup request and quoted lock
   prices. Stock rc9 rejects that setup request before the creator can publish.
3. Paykit `v0.1.0-rc9` (`f7029fcd20a9a69a63daca396328289d6dcd1d8b`) includes #47's asset-aware
   setup/quote contract and `paid_on_time`. Keep its `[usdt]` section absent for this Bitcoin regtest
   flow; the walkthroughs use Bitcoin prices unless stated otherwise.

Source contracts: [SDK request](https://github.com/pubky/locks/blob/c692fb70522cf75025b86ad72a3b98fa7ef84e72/locks-sdk/src/creator.rs),
[matching handler](https://github.com/pubky/locks/blob/c692fb70522cf75025b86ad72a3b98fa7ef84e72/locks-server/src/api/paykit.rs)
and [Paykit #47](https://github.com/pubky/paykit-server/pull/47).

The stock rc9 Compose defaults are older (section 13, issues 6 and 7). The Locks source pin above
updates Paykit's default to #47, but still needs the explicit images and homeserver recipe below.

Check what is running:

```bash
for c in locks-server paykit-server pubky-testnet; do docker inspect pubky-locks-paykit-demo-$c-1 --format '{{.Config.Image}}'; done
```

---

## 4. Build the images

You only need this when you set up the stack for the first time, or when you move to a new version.

### 4.1 Source checkouts

```bash
SRC="$HOME/dev/synonym/locks-local-build"
LOCKS_SOURCE=c692fb70522cf75025b86ad72a3b98fa7ef84e72
PAYKIT_SOURCE=f7029fcd20a9a69a63daca396328289d6dcd1d8b
mkdir -p "$SRC"
cd ~/dev/synonym/paykit-server
git fetch origin "$PAYKIT_SOURCE"
git worktree add --detach "$SRC/paykit" "$PAYKIT_SOURCE"
cd ~/dev/synonym/locks
git fetch origin "$LOCKS_SOURCE"
git worktree add --detach "$SRC/locks" "$LOCKS_SOURCE"
```

For an existing worktree, verify `git rev-parse HEAD` against these pins instead of adding it again.
Do not discard its local entrypoint edits or `.local/` state. The Paykit tag below remains `rc9`; the
Locks image uses `c692fb70522c` so it cannot be confused with the incompatible stock rc9 image.

The paykit-rs version must be the one pinned in paykit-server's `Cargo.toml` for that tag.

### 4.2 Paykit Server and Lock Server

Before building Locks, edit `$SRC/locks/docker/locks-server-compose-entrypoint.sh` in the pinned build
worktree:

1. Set `frontend_session_code_ttl_seconds = 600` (120 seconds is too short for manual copy and paste).
2. Add `"http://localhost:4000"` to `allowed_return_origins` so the app's auth iframe can return there.

The Dockerfile copies this script into the image. The Compose service does **not** mount the script
from `~/dev/synonym/locks`, so editing that other checkout and restarting a container has no effect.
Build the patched worktree below, then retag it in 4.4.

```bash
cd "$SRC/paykit" && docker buildx build --load -f Dockerfile.local -t pubky-locks-paykit-server:rc9 \
  --build-context paykit-lib='https://github.com/pubky/paykit-rs.git#v0.1.0-rc71:paykit-lib' \
  --build-context paykit-sdk='https://github.com/pubky/paykit-rs.git#v0.1.0-rc71:paykit-sdk' \
  --build-context locks='https://github.com/pubky/locks.git#c692fb70522cf75025b86ad72a3b98fa7ef84e72' .

cd "$SRC/locks" && docker build -f Dockerfile -t pubky-locks-paykit-demo-locks-server:c692fb70522c .
```

### 4.3 Homeserver testnet v0.15.0 — Needs fix / to confirm

The `locks` testnet Dockerfile (`docker/pubky-testnet.Dockerfile`) and the compose file still pin homeserver
`v0.11.0` at rc9 (section 13, issue 7). To build v0.15.0 locally, copy that Dockerfile, set
`PUBKY_HOMESERVER_REF=v0.15.0`, and remove the `cargo update -p quinn-proto` line (that pin is for the v0.11.0
lockfile). Then build it with the tag `pubky-locks-paykit-demo-pubky-testnet:v0.15.0`.

### 4.4 Point the Compose tags at the new images

Keep the old images under a second tag, so that you can roll back.

```bash
docker tag pubky-locks-paykit-server:local pubky-locks-paykit-server:pre-rc9 2>/dev/null
docker tag pubky-locks-paykit-server:rc9 pubky-locks-paykit-server:local
docker tag pubky-locks-paykit-demo-locks-server:latest pubky-locks-paykit-demo-locks-server:pre-rc9 2>/dev/null
docker tag pubky-locks-paykit-demo-locks-server:c692fb70522c pubky-locks-paykit-demo-locks-server:latest
docker tag pubky-locks-paykit-demo-pubky-testnet:latest pubky-locks-paykit-demo-pubky-testnet:v0.11.0 2>/dev/null
docker tag pubky-locks-paykit-demo-pubky-testnet:v0.15.0 pubky-locks-paykit-demo-pubky-testnet:latest
```

When an image with the Compose tag exists, Compose uses it and does not build. This is why rule 6 matters.

### 4.5 Clear the build cache after every build

The builds above leave about 10 GB of build cache that nothing uses afterwards. Clear it as soon as the images are
built and tagged:

```bash
docker builder prune -af
```

Do not use `docker image prune -a` to free space. It also deletes images that no container uses at this moment but
that you still need, such as the rollback tags from 4.4.

---

## 5. Start the stack

### 5.1 First start

On a new machine, first build and tag the patched `c692fb70522c` Lock Server image (4.2 and 4.4).

```bash
cd "$SRC/locks"
LOCKS_CREATOR_DEMO_PORT=8090 docker compose -f compose.paykit-local-demo.yaml up -d paykit-server
```

This starts `paykit-server` and everything it depends on. If some services stay in the `created` state, run the same
command once more. Check the state with `dc ps -a --format '{{.Service}}\t{{.State}}\t{{.Health}}' | sort`.
`paykit-server` stops right away on the first start, because the generated config is not valid for rc9 yet. 5.2 fixes it.

Once `locks-server` reports healthy, generate the JavaScript demo configuration explicitly:

```bash
dc run --rm --no-deps demo-config
test -s .local/demo-config/config.json
```

`demo-config` is a sibling service, not a dependency of `paykit-server`, so the `up` command above
never runs it. The later `authenticate` command needs this JSON. This one-off job writes only the demo
configuration; do not rerun `paykit-config` after editing its TOML in 5.2.

### 5.2 Fix the configuration for rc9

1. **Paykit config** (`.local/paykit-config/config.toml`). rc9 refuses to start when the file has a key it does not
   know.
   1. Delete the lines `receiver_path = ...` and `receiver_path_priority = ...`.
   2. In the `[paykit]` table, add `app_id = "paykit-server"` (keep `client_id`).
   3. In `[setup].allowed_origins`, keep the existing entries and add `"http://localhost:4000"`. This is
      Paykit's own callback allowlist; the separate Lock Server `allowed_return_origins` does not cover it.
2. **Lock Server entrypoint.** The image must contain the patch from 4.2. If the container already
   existed before that build, repeat 4.2 and 4.4 with the patched build worktree, then recreate only Locks:
   ```bash
   LOCKS_CREATOR_DEMO_PORT=8090 dc up -d --no-deps --force-recreate locks-server
   ```
   A plain restart keeps the old image and cannot apply a changed entrypoint. Do not recreate
   `pubky-testnet` just to apply this patch.
3. **Paykit database.** If this Paykit database was created by an older Paykit version, rc9 cannot start, because the
   first migration's checksum changed. Empty the schema. This removes every connected creator account, so the creator
   must do the Bitkit approval again (section 9).
   ```bash
   docker exec pubky-locks-paykit-demo-paykit-postgres-1 psql -U paykit -d paykit \
     -c "drop schema public cascade; create schema public; grant all on schema public to paykit;"
   ```
4. Restart the two containers (not with Compose, see rule 4):
   ```bash
   docker restart pubky-locks-paykit-demo-paykit-server-1 pubky-locks-paykit-demo-locks-server-1
   ```

**Upgrading a stack that already runs** (instead of a first start): back up both databases first, then do 5.2 and
recreate the three services together:

```bash
docker exec pubky-locks-paykit-demo-paykit-postgres-1 pg_dump -U paykit -d paykit > paykit-backup.sql
dc exec -T postgres pg_dump -U locks -d locks_test > locks-backup.sql
LOCKS_CREATOR_DEMO_PORT=8090 docker compose -f compose.paykit-local-demo.yaml up -d --no-deps --force-recreate pubky-testnet locks-server paykit-server
```

Recreating `pubky-testnet` empties the homeserver, so continue with section 8.

### 5.3 Health checks

```bash
curl -s http://127.0.0.1:3000/readyz                                                   # {"status":"ready",...}
curl -s -o /dev/null -w 'paykit %{http_code}\n' http://127.0.0.1:3001/health/ready     # 200
curl -s -o /dev/null -w 'homeserver %{http_code}\n' http://127.0.0.1:6286/             # 200
curl -s -o /dev/null -w 'pkarr relay %{http_code}\n' http://127.0.0.1:15411/           # 200
curl -s http://127.0.0.1:3000/.well-known/locks-server                                 # Lock Server pubky
```

A container that says "Up" can still be broken. For Fulcrum and Bitcoin, use the checks in section 12.

`homegate-bridge` restarts a Node process every 2 seconds for its health check and uses a lot of CPU. Stop it while
you do not need sign-up: `dc stop homegate-bridge`.

---

## 6. Nexus

The app reads feeds and profiles from Nexus. Nexus runs from the `pubky-nexus` repository on the host.

```bash
cd ~/dev/synonym/pubky-nexus/docker && docker compose up -d neo4j redis
cd ~/dev/synonym/pubky-nexus && nohup cargo run -p nexusd > /tmp/nexusd.log 2>&1 &
curl -s -o /dev/null -w 'nexus %{http_code}\n' http://localhost:8080/v0/info
```

Nexus is configured in `~/.pubky-nexus/config.toml`: testnet mode on, homeserver
`8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo` (the fixed testnet homeserver), API on `127.0.0.1:8080`.
See the `pubky-nexus` README for the full file.

If new posts appear on the homeserver but not in the app, see section 12 ("Feeds do not show new posts").

---

## 7. Identities

Each role has its keys in `.local/<role>/` in the `locks` repository: `recovery_file`, `passphrase` and
`profile.json`. The `examples/js-sdk` commands sign with these files, and you sign in to pubky-app with the same
recovery file and passphrase after the role has been registered on the homeserver.

```bash
npm --prefix examples/js-sdk install            # once
npm --prefix examples/js-sdk run create-user -- --role content-creator
npm --prefix examples/js-sdk run create-user -- --role content-viewer
```

`create-user` only creates local files; it does not register the identity. For each new role, start
pubky-app's **Pubky Ring** sign-in, copy its `pubkyauth://signin_grant?...` URL, and approve it with
`authenticate` in 9.1 (`content-creator` or `content-viewer` as appropriate). That command registers
the identity before approving the app sign-in. Subsequent sign-ins can use the recovery file.

1. Do not use `create-user --force` on an existing role. It overwrites the recovery file and the pubky changes.
2. To use another account for a role, back up the three files first, then replace `recovery_file` and `passphrase`
   together. A recovery file with the wrong passphrase does not open. Update `pubky` in `profile.json`.
3. Prefer to keep the same creator. A new creator account (or an emptied Paykit database) starts deriving addresses
   at index 0 again and reuses addresses that were already paid on this chain (section 9.3, note 3).

---

## 8. After a testnet restart

Homeserver v0.15 starts with an empty database every time. Lock Server and Paykit keep their databases. Recover in
this order:

1. Register both existing identities on the new homeserver again using `authenticate` with the app's
   Pubky Ring sign-in URL, as in sections 7 and 9.1. It loads the existing role key and calls signup
   before approving. Do not use `create-user --force`: that replaces the identity rather than restoring it.
   Without registration the creator steps fail with `404 UserNotFound` or DHT-resolution errors.
2. Reset the Nexus cursor. The new homeserver numbers its events from the start again, but Nexus waits for events
   after its old cursor, so new posts never reach the app:
   ```bash
   docker exec redis redis-cli JSON.SET "Homeserver:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo" '$.cursor' 0
   ```
3. Do sections 9 and 10 again from the start (the Paykit markers were on the homeserver).
4. Publish the lock posts again in the app (the lock files were on the homeserver).

---

## 9. Approval commands (acting as Bitkit)

Pick the command by the shape of the `pubkyauth://` URL that the app shows. The codes expire, so run the command right
after you copy the URL.

| URL shape                                         | Meaning                                                                                    | Section  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| `pubkyauth://signin?caps=/pub/app.locks/...`      | Sign in to Lock Server (creator)                                                           | 9.1      |
| `pubkyauth://signin_grant?...&cid=pubky.app&...`  | pubky-app sign-in with Pubky Ring, or the Locks permission step (#2373); creator or reader | 9.1      |
| `pubkyauth://signin_grant?...&x-bitkit-claim=...` | Creator connects a Paykit account                                                          | 9.2, 9.3 |

### 9.1 App or Lock Server sign-in

```bash
npm --prefix examples/js-sdk run authenticate -- --role content-creator --auth "pubkyauth://signin?..."
```

Lock Server sign-in is creator-only; readers stay anonymous to Lock Server. Use `--role content-viewer`
for the reader's app sign-in or Locks permission-upgrade URL (#2373). Pass the complete URL the app
shows, including `cid`, `cpk` and the relay; app sign-in uses `signin_grant`, while Lock Server sign-in
still uses `signin`. The helper passes either URL to the SDK's `approveAuthRequest`.
It attempts homeserver signup before approval and accepts an already registered identity, so it also
bootstraps registration for either role (section 7). Live grant approval with the current app remains
part of the validation still needed at the top of this runbook.

### 9.2 Creator: Paykit key authorization — Needs fix

rc9 Paykit requires the creator to publish a Paykit Noise key authorization to the homeserver before the Bitkit
approval. `examples/js-sdk` has no command for it yet (section 13, issue 2). Without it, the Bitkit approval stops
after the `xpub_validate` stage in the Paykit log, and the `creators` table stays empty.

### 9.3 Creator: Bitkit approval for the Paykit account — Needs fix

When the creator chooses a paid lock, the app shows the Paykit setup with a `pubkyauth://signin_grant?...` URL. The
command reads three lines on stdin: the URL, the account tpub and the account index.

```bash
TPUB=$(npm --prefix examples/js-sdk run generate-paykit-account-tpub 2>&1 | grep -oE 'tpub[A-Za-z0-9]{40,}')
printf '%s\n%s\n%s\n' 'pubkyauth://signin_grant?...' "$TPUB" '0' \
  | npm --prefix examples/js-sdk run authenticate-paykit -- --role content-creator
```

1. **With rc9 this fails with `invalid input`:** the command does not send `key_generation`, which the rc9 helper
   requires (section 13, issue 1).
2. The approval binary runs inside a container. By default the command uses the `creator-demo` container.
   `PAYKIT_COMPANION_AUTH_BIN` can point to another wrapper; the same binary is also in `paykit-server`. To confirm
   which container to use: in our setup, `creator-demo` had no external DNS (`EAI_AGAIN`).
3. If the Paykit database was emptied, or the creator is new, raise the next address index above every index that
   was used before on this chain. Otherwise Paykit reuses paid addresses and invoices confirm instantly:
   ```bash
   docker exec pubky-locks-paykit-demo-paykit-postgres-1 psql -U paykit -d paykit \
     -c "update creators set next_child_index = greatest(next_child_index, <highest used index + 1>)"
   ```
4. `generate-paykit-account-tpub` prints only the public account descriptor of a regtest wallet. Use
   `grep -oE 'tpub[A-Za-z0-9]{40,}'`. A shorter pattern matches the label "tpub:" first.
5. If the app still says the setup failed, check whether the server got it:
   `docker exec pubky-locks-paykit-demo-paykit-postgres-1 psql -U paykit -d paykit -Atc "select updated_at from creators"`.

### 9.4 Reader: prepare the wallet (after 9.3) — Needs fix / to confirm

```bash
npm --prefix examples/js-sdk run prepare-paykit-reader
```

This publishes the reader's Paykit markers, so the app sees that the reader "has Bitkit". Without it, the app shows
the "Install Bitkit" screen. With rc9 this command does not run as shipped (section 13, issue 5).

**Order matters.** The reader caches the creator's Paykit key. If the reader prepared before the creator's Bitkit
approval created a new key (for example after the Paykit database was emptied), the link never connects. Prepare the
reader again after every creator approval that follows an emptied Paykit database.

---

## 10. Paying for a lock (reader)

1. In the app, as the reader, open the paid lock and press **Unlock**. If the modal shows a QR code, do not scan anything:
   the reader command in the next step makes the connection that the QR code stands for.
2. Receive the payment request. Run it once and let it finish (it waits up to about 5 minutes for the request):
   ```bash
   npm --prefix examples/js-sdk run receive-paykit-request
   ```
   It prints `amount_sats`, `address` and a ready `payment_command`. Check that the amount is the one you expect.
   **Needs fix:** with rc9 the stock reader helper rejects the request or never accepts it, so the lock does not open
   after payment (section 13, issues 3, 4 and 5).
3. Pay and mine 6 blocks:
   ```bash
   dc exec -T bitcoin sh -ec 'bitcoin-cli -conf="$BITCOIN_DATA/bitcoin.conf" -regtest -rpcwallet=miner sendtoaddress "<address>" "<amount in BTC>"'
   dc exec -T bitcoin sh -ec 'B="bitcoin-cli -conf=$BITCOIN_DATA/bitcoin.conf -regtest -rpcwallet=miner"; $B generatetoaddress 6 "$($B getnewaddress)"'
   ```
   The amount is in BTC: 22,222 sats is `0.00022222`. The minimum is 546 sats. Smaller amounts are dust and
   `sendtoaddress` fails with `-6 Transaction amount too small`.
4. When the request was accepted, the Lock Server log shows `completed verification task ... status=Completed`
   within about 15 seconds and the app unlocks the content. If the modal does not change, reload the page.

Checks:

```bash
docker exec pubky-locks-paykit-demo-paykit-postgres-1 psql -U paykit -d paykit -Atc \
  "select sdk_payment_request_id, request_state from payment_request_lifecycles order by updated_at desc limit 3"
docker logs --since 5m pubky-locks-paykit-demo-locks-server-1 2>&1 | grep 'completed verification task'
```

`request_state` must become `accepted`. The task needs `accepted`, a matching amount and payment on time.

Notes:

1. A completed purchase is never paid again; to pay again, use a new lock. The app stores each purchase id in
   the reader's homeserver at `/priv/social/purchases/<lock_id>/<bundle_id>.json` (older purchases:
   `/priv/social/purchases/<lock_id>.json`) and reuses a saved id that can still pay (#2831). After a failed
   or expired purchase, Try again saves a new id for the same lock.
2. Since rc9, Lock Server creates the invoice in the background. It retries for up to 10 minutes. If Paykit is down
   longer, the task fails with `invoice admission deadline exceeded`, and the reader presses Try again in the app.

---

## 11. Database cheat sheet

```bash
PK() { docker exec pubky-locks-paykit-demo-paykit-postgres-1 psql -U paykit -d paykit "$@"; }
LK() { docker exec pubky-locks-paykit-demo-postgres-1 psql -U locks -d locks_test "$@"; }
```

| Question                                   | Query                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is the creator's Paykit account connected? | `PK -Atc "select updated_at, next_child_index from creators"`                                                                                                            |
| Invoices and their payment state           | `PK -c "select * from invoices order by created_at desc limit 5"`                                                                                                        |
| Did the payment request reach the reader?  | `PK -c "select invoice_id, status, error_class, attempt_count, next_attempt_at from outbox where status<>'delivered' order by created_at desc limit 5"`                  |
| Did the reader accept the request?         | `PK -Atc "select sdk_payment_request_id, request_state from payment_request_lifecycles order by updated_at desc limit 3"`                                                |
| Lock Server tasks                          | `LK -c "select bundle_id, status, invoice_admission_phase, admission_deadline_at, failure_message, created_at from verification_tasks order by created_at desc limit 5"` |

Outbox states: `handed_off` means the message was delivered and only the bookkeeping is left; it becomes `delivered`
on the next retry. `retryable` with `error_class=link_establishment` that keeps counting up means the link is stuck
(section 12). To retry now instead of waiting 5 minutes:
`PK -c "update outbox set next_attempt_at=now() where status in ('retryable','queued')"`.

### Resets

1. **A task stuck in `pending`.** The app reuses the same bundle id while the task is pending, so it waits forever.
   Mark it failed, then press Try again in the app:
   `LK -c "update verification_tasks set status='failed', failure_message='local test reset' where status='pending'"`
2. **Empty this disposable local Paykit database** (broken sessions or links). This deletes creator
   payout registrations, invoice history and drain state. Stop browser/demo payment activity and any
   terminal `receive` process first. Stop both producers, keeping PostgreSQL and `pubky-testnet` running:

   ```bash
   dc stop locks-server paykit-server creator-demo reader-demo
   PK -c "COPY (SELECT creator_lookup_hash, next_child_index FROM creators) TO STDOUT WITH CSV HEADER" > paykit-reset-address-indices.csv
   docker exec pubky-locks-paykit-demo-paykit-postgres-1 pg_dump -U paykit -d paykit > paykit-before-reset.sql
   docker exec pubky-locks-paykit-demo-postgres-1 pg_dump -U locks -d locks_test > locks-before-paykit-reset.sql
   ```

   Verify both dumps succeeded before continuing. Preserve the recorded address indices: after
   reapproval, raise each creator's `next_child_index` to at least its saved next index before any new
   invoice (9.3, note 3), or use a fresh regtest account descriptor. Do not reuse already-paid addresses.
   Abandon outstanding **local test** purchases so restarting Locks cannot resume their old invoices,
   then reset all dependent rc9 Paykit tables in one statement:

   ```bash
   LK -v ON_ERROR_STOP=1 -c "UPDATE verification_tasks SET status='failed', failure_message='local Paykit reset' WHERE status IN ('pending', 'in_progress');"
   PK -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE
     payment_drain_cancellations,
     payment_drain_items,
     payment_drains,
     payment_request_lifecycles,
     invoice_timely_amount_matched_outpoints,
     bitcoin_observations,
     usdt_observations,
     outbox,
     invoices,
     lock_payment_generations,
     reader_assignments,
     creators;"
   ```

   This preserves `deployment_metadata`, `_sqlx_migrations`, configuration and server identities.
   It deliberately uses an explicit `TRUNCATE` set, without `CASCADE`: ordinary drain deletion runs a
   completion/generation trigger and cannot implement a full reset of active drains. rc9 has no
   `sdk_states` table; do not copy old reset commands that mention it. The table set follows the
   [rc9 migrations](https://github.com/pubky/paykit-server/tree/f7029fcd20a9a69a63daca396328289d6dcd1d8b/paykit-server/migrations),
   including lifecycle, generation, drain/cancellation and USDT dependencies.

   After both SQL commands succeed, start the existing containers without regenerating config:

   ```bash
   docker start pubky-locks-paykit-demo-paykit-server-1 &&
     curl --fail --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:3001/health/ready &&
     docker start pubky-locks-paykit-demo-locks-server-1 &&
     curl --fail --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/readyz
   ```

   Wait for each readiness check to succeed before the next service or any approval. Redo 9.2–9.4,
   restore the address-index floor, and use new lock posts for new tests. Keep the demo workers stopped
   while using terminal helpers (rule 5). No live stack should use this destructive test reset.

3. Homeserver data: with v0.15 there is nothing to reset. Every testnet start uses a new temporary database
   (`pubky_test_*`).

---

## 12. Troubleshooting

| Symptom                                                                                         | Cause                                                                                           | Fix                                                                                               |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bitkit approval prints `invalid input`                                                          | rc9 needs `key_generation`                                                                      | Section 13, issue 1                                                                               |
| Approval stops after `xpub_validate`, `creators` stays empty                                    | Creator key authorization missing                                                               | Section 13, issue 2                                                                               |
| Creator steps fail with `404 UserNotFound`, or `Failed to resolve the DHT record`               | Testnet restarted, accounts and pkarr records gone                                              | Section 8                                                                                         |
| `acquire Pubky write lock`                                                                      | Homeserver older than v0.15                                                                     | Section 4.3                                                                                       |
| `receive-paykit-request` ends with `protocol_failed`                                            | rc9 reader helper rejects the request                                                           | Section 13, issue 3                                                                               |
| Paid and 6 blocks mined, invoice confirmed, task stays `pending`, `request_state` is `proposed` | The reader never accepted the request                                                           | Section 13, issue 4                                                                               |
| Invoice confirms seconds after Pay, the reader never got a request                              | Address reuse after a new creator or emptied Paykit data                                        | Raise `next_child_index` (9.3, note 3), then use a new lock                                       |
| `receive` times out again and again, outbox shows `link_establishment`                          | Reader and Paykit disagree on the link; usually the reader prepared before the creator approval | Prepare the reader again; if it stays stuck, empty the Paykit data (11, reset 2) and redo 9.2–9.4 |
| `{"error":"state_busy"}`                                                                        | Another reader process uses the same state (an earlier `receive`, or the `reader-demo` worker)  | Stop the other process (rule 5, rule 8)                                                           |
| Task `failed` with `invoice admission deadline exceeded`                                        | Paykit was down for more than 10 minutes                                                        | Start Paykit (rule 4), Try again in the app                                                       |
| `paykit-server` dies with `configuration TOML is invalid`                                       | `paykit-config` job overwrote the config                                                        | Section 5.2 step 1, then `docker start`                                                           |
| `paykit-server` dies with `creator integrity check failed`                                      | Creator credentials fail integrity checks, for example after a master-key mismatch              | Section 11, reset 2                                                                               |
| Payments stay undetected; Paykit log repeats `Trying to connect to ...:50001`                   | Fulcrum is not serving. After a day off, bitcoind is back in initial block download             | Mine one block (below)                                                                            |
| Feeds do not show new posts                                                                     | Nexus cursor after a testnet restart, or `nexusd` lost the homeserver                           | Section 8 step 2, or restart `nexusd`                                                             |
| Homeserver file: `HEAD` 200 but `GET` 404                                                       | File contents lost on the homeserver                                                            | Publish the lock again                                                                            |
| `docker ps` hangs and the Mac gets hot                                                          | Host disk is full and the Docker VM went read-only                                              | Free disk space, restart Docker Desktop                                                           |

**Fulcrum and Bitcoin.** Regtest goes back into initial block download when the newest block is older than 24 hours,
and Fulcrum does not open its port during that time. One new block fixes it:

```bash
B='bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf -regtest'
dc exec -T bitcoin sh -ec "$B loadwallet miner" 2>/dev/null
dc exec -T bitcoin sh -ec "$B -rpcwallet=miner generatetoaddress 1 \$($B -rpcwallet=miner getnewaddress)"
nc -z -G 3 127.0.0.1 60001 && echo fulcrum open
```

`loadwallet miner` is needed after Docker was stopped hard. Without it, mining fails with
`Requested wallet does not exist`.

---

## 13. Known issues with rc9 commands (needs fix / to confirm)

These are the original helper limitations, separate from the SDK/server compatibility fix in
section 3. They have to be fixed in `locks` or `paykit-server`; the version pairing does not make the
terminal approval/payment flow complete. "Checked at rc10" below records the original author's
check of that tag, not a live validation performed for the 2026-10-15 documentation update.

1. **Bitkit approval** (`authenticate-paykit`, `locks`): does not send `key_generation`, which the rc9 companion
   helper requires. Result: `invalid input`. Checked at rc10.
2. **Creator Paykit key authorization** (`locks` / `paykit-server`): rc9 Paykit requires it before the Bitkit
   approval, and `examples/js-sdk` has no command that publishes it. Checked at rc10.
3. **Reader helper rejects the payment request** (`paykit-server`): the rc9 server's proposal has
   `proposal_expires_at` and no `metadata.reader`, and the rc9 reader helper rejects both. Result: `protocol_failed`.
   To confirm: paykit-server rc10 has a change named "honor reader proposal deadlines", which may fix this.
4. **Reader helper never accepts the payment request** (`paykit-server`): rc9 Lock Server only completes a task when
   the Paykit request is `Accepted` (or `ProofSubmitted` / `ActiveRecurring`). A real Bitkit accepts; the demo helper
   does not, so the task stays `pending` after payment. Checked at rc10.
5. **Reader commands** (`prepare-paykit-reader`, `receive-paykit-request`, `locks`): they call the helper binary at
   its path inside a container, so they do not run on a macOS host as shipped. They also do not pass
   `PAYKIT_READER_APP_ID`, which replaced `PAYKIT_READER_RECEIVER_PATH` / `PAYKIT_READER_SERVER_PATH` in rc9
   (the value is `bitkit`). To confirm how they should run with rc9.
6. **Compose pins an old Paykit** (`locks`): `compose.paykit-local-demo.yaml` builds paykit-server `0.1.0-rc7` with
   paykit-rs `v0.1.0-rc59`, which does not send `paid_on_time`. With the default build, payments never complete.
   This is the stock rc9 default. The `c692fb70522c` source pin updates it to Paykit #47 and paykit-rs
   rc71; sections 3–4 still pin the images explicitly.
7. **Testnet pins homeserver v0.11.0** (`locks`): the rc9 SDK needs v0.15 or newer. Checked at rc10.
8. **rc10 adds a reader step** (to confirm when moving to rc10): paykit-server rc10 requires the reader's signed
   Noise Key Authorization at invoice admission, so the reader flow will need its own key authorization step.
9. **Lock Server `v0.1.0` pairing** (`locks` / `paykit-server`): the app installs SDK `0.1.0` since #2849. Its
   server tag depends on the stable `paykit-lib` 0.1.0 and `pubky` 0.16.2, while this runbook builds Paykit rc9
   with paykit-rs rc71. Whether paykit-server `v0.1.0` (its own stable tag) is the match for Lock Server
   `v0.1.0`, and whether the rc9 helper gaps above still apply there, is to confirm. Until then the `c692fb70522c` build is the documented server.

---

## 14. pubky-app

```bash
cd ~/dev/synonym/pubky-app
npm ci
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const sdk = JSON.parse(readFileSync('node_modules/@synonymdev/locks-sdk/package.json', 'utf8'));
// The npm release carries no source-commit field; the version is the only pin to check.
if (sdk.version !== '0.1.0') {
  throw new Error('Recheck the SDK/server pins before using this runbook');
}
console.log(sdk.version);
NODE
PORT=4000 npm run dev -- --webpack
```

Point the app at the local stack in `pubky-app/.env.local`. These values come from the ports above. Ask a teammate
for a working file if something does not connect.

```bash
PUBKY_RUNTIME_NEXUS_URL=http://localhost:8080
PUBKY_RUNTIME_CDN_URL=http://localhost:8080/static
PUBKY_RUNTIME_HOMESERVER=8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo
PUBKY_RUNTIME_HOMESERVER_URL=http://localhost:6286
PUBKY_RUNTIME_HOMEGATE_URL=http://localhost:6288
PUBKY_RUNTIME_DEFAULT_HTTP_RELAY=http://127.0.0.1:15412/inbox
PUBKY_RUNTIME_PKARR_RELAYS=["http://localhost:15411"]
PUBKY_RUNTIME_TESTNET=true
PUBKY_RUNTIME_ENV=production
PUBKY_RUNTIME_LOCK_SERVER=<the "lock_server" value from http://127.0.0.1:3000/.well-known/locks-server>
PUBKY_RUNTIME_PAYKIT_SERVER_URL=http://localhost:3001
```

1. Without `PUBKY_RUNTIME_LOCK_SERVER` and `PUBKY_RUNTIME_PAYKIT_SERVER_URL`, the app hides the Locks features.
2. `npm run build && PORT=4000 npm run start` keeps the app on port 4000 (Locks uses 3000).
   Production requires all network values in the block above, including `PUBKY_RUNTIME_ENV`.
   `PUBKY_RUNTIME_SHOP_URL` was removed with the embedded Shop; it is not part of this configuration.
3. `PUBKY_RUNTIME_ENV=production` turns off the staging homeserver sign-in guard. With `staging`, every sign-in
   resolves the account's homeserver through the local PKARR relay and compares it with `PUBKY_RUNTIME_HOMESERVER`;
   that works on the local stack only when the relay answers, so `production` is the safer value here.
4. For a new role, first register it with the app's Pubky Ring sign-in URL and `authenticate`
   (sections 7 and 9.1). Once registered, sign in with the recovery file and passphrase from `.local/<role>/`.
