#!/usr/bin/env bash
# Joins the two halves of a WebKit e2e run (e2e-test.yml). macOS runners cannot run Docker, so the
# `webkit-stack` job runs the pubky-stack on Ubuntu while the `webkit-test` job runs the app and
# Cypress on macOS. GitHub-hosted runners cannot reach each other, and job outputs only pass when a
# job ends, so the two jobs find each other through artifacts and talk through a tunnel:
#
#   1. macOS   `client-key`  creates an SSH key pair; the workflow uploads the public half.
#   2. Ubuntu  `expose`      waits for that key, starts an sshd that accepts only it and only forwards
#                            to the stack's ports, publishes the sshd through a cloudflared quick
#                            tunnel (no account or secret), and writes the tunnel host, the sshd host
#                            key, the ports and the app's runtime config for the workflow to upload.
#   3. macOS   `connect`     waits for that upload and forwards the stack's ports to its own localhost.
#              `start-app`   starts the built app with the runtime config the Docker app would get.
#                            Both sit behind e2e-loopback-demux.mjs, see LOCAL_PORT_OFFSET.
#   4. Ubuntu  `hold`        keeps the stack up until the macOS job completes and ends as it did, so
#                            "Re-run failed jobs" re-runs the pair.
#
# Keeping the port numbers means nothing has to be told where the stack is: the app, the SDK's
# testnet mode (which reads the homeserver's port from its pkarr record) and the Cypress tasks use
# the same `localhost:<port>` addresses as in the Docker jobs. Every port a browser or the Node SDK
# uses is HTTP; the testnet DHT (UDP) is only used between the containers and stays on Ubuntu.
# Forwarded are the ports the stack always publishes plus every other localhost port the app's
# runtime config names (Homegate, for one), so the app reaches whatever it would in a Docker job.
#
# Only public values cross the artifacts: two public keys, the tunnel hostname and PUBKY_RUNTIME_*
# (public by definition, docs/environment.md). The repository is public, so are its artifacts.
#
# Environment (the remaining commands only need RUNNER_TEMP):
#   expose, hold, connect   GH_TOKEN, REPO, RUN_ID, RUN_ATTEMPT, PEER_JOB (the other half's job name)
#   expose                  CLIENT_KEY_ARTIFACT; run it in pubky-stack/docker with the compose variables set
#   connect                 ENDPOINT_ARTIFACT, CYPRESS_PORT (the port Cypress's proxy is told to use)
set -euo pipefail

# Asset digests of this release, as the GitHub release API reports them.
CLOUDFLARED_VERSION=2026.10.7
CLOUDFLARED_SHA256_LINUX_X86_64=1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872
CLOUDFLARED_SHA256_DARWIN_ARM64=3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd
CLOUDFLARED_SHA256_DARWIN_X86_64=02f3edfd87684dd5b705607688e4eb4b323f6e777b81e7b3a85af556aa356848

# Homeserver HTTP, homeserver admin, Nexus API, pkarr relay, HTTP relay: what pubky-stack always
# publishes for the browser, the SDK and the Cypress tasks, so both jobs wait for them. `expose`
# adds the other localhost ports of the app's runtime config. The databases are deliberately left out.
REQUIRED_PORTS=(6286 6288 8080 15411 15412)
APP_PORT=3000
APP_URL=http://localhost:$APP_PORT
# In run 42930147161 WebKit on macOS sent most requests for the page on localhost:3000 to the app
# on that port instead of to Cypress's proxy (e2e-loopback-demux.mjs has the details). So on macOS
# the app and the forwarded stack ports listen this much higher, and the demux takes the ports
# everything is configured with: it passes what was meant for the proxy to Cypress on CYPRESS_PORT
# and the rest to the real port.
LOCAL_PORT_OFFSET=20000
SSH_PORT=22022
SSH_ALIAS=e2e-stack

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORK_DIR="${RUNNER_TEMP:?RUNNER_TEMP is not set}/e2e-remote-stack"
LOG_DIR="$WORK_DIR/logs"
mkdir -p "$LOG_DIR"

fail() {
  echo "::error::$*"
  exit 1
}

require_env() {
  local var
  for var in "$@"; do
    [ -n "${!var:-}" ] || fail "Required environment variable $var is not set."
  done
}

# "<status>:<conclusion>" of the other half's job in this run attempt, e.g. "in_progress:null" or
# "completed:success"; "unknown" while the job is not listed or when the API call fails.
peer_state() {
  gh api "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs?per_page=100" 2>/dev/null |
    jq -r --arg name "$PEER_JOB" \
      '[.jobs[] | select(.name == $name)] | last | if . == null then "unknown" else "\(.status):\(.conclusion)" end' \
      2>/dev/null || echo unknown
}

# For a timeout message: a state that stays "unknown" usually means PEER_JOB matches no job name.
job_names() {
  gh api "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs?per_page=100" \
    --jq '[.jobs[].name] | join("; ")' 2>/dev/null || echo "not available"
}

# upload-artifact makes an artifact downloadable as soon as its step ends, while the run is in
# progress. Gives up early when the other half has already ended, since it will never upload.
wait_for_artifact() {
  local name=$1 dir=$2 deadline=$((SECONDS + $3)) state
  until rm -rf "$dir" && gh run download "$RUN_ID" --repo "$REPO" --name "$name" --dir "$dir" >/dev/null 2>&1; do
    state=$(peer_state)
    case "$state" in
      completed:*) fail "\"$PEER_JOB\" ended ($state) without uploading $name. Re-run both halves together." ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || fail "$name did not appear within $3 seconds (\"$PEER_JOB\" is $state; jobs: $(job_names))."
    echo "Waiting for $name... (\"$PEER_JOB\" is $state)"
    sleep 10
  done
  echo "Downloaded $name."
}

# Any HTTP answer counts, whatever its status: it proves a server is behind the port. A forwarded
# port accepts the TCP connection even when its far end is dead, so a connect check is not enough.
answers_http() {
  curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$1/"
}

# timeout port...
wait_for_ports() {
  local deadline=$((SECONDS + $1)) port pending
  shift
  while true; do
    pending=""
    for port in "$@"; do
      answers_http "$port" || pending="$pending $port"
    done
    [ -z "$pending" ] && return 0
    [ "$SECONDS" -lt "$deadline" ] || {
      echo "No HTTP answer on port(s):$pending"
      return 1
    }
    sleep 3
  done
}

kill_tree() {
  local pid=$1 child children
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
  for child in $children; do kill_tree "$child"; done
}

# Waits a moment for the process to end, so that what it logs on the way out is in its log.
stop_process() {
  local pid_file=$1 pid tries=0
  [ -f "$pid_file" ] || return 0
  pid=$(cat "$pid_file")
  kill_tree "$pid"
  while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 20 ]; do
    tries=$((tries + 1))
    sleep 0.1
  done
  rm -f "$pid_file"
}

install_cloudflared() {
  local asset sha
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) asset=cloudflared-linux-amd64 sha=$CLOUDFLARED_SHA256_LINUX_X86_64 ;;
    Darwin-arm64) asset=cloudflared-darwin-arm64.tgz sha=$CLOUDFLARED_SHA256_DARWIN_ARM64 ;;
    Darwin-x86_64) asset=cloudflared-darwin-amd64.tgz sha=$CLOUDFLARED_SHA256_DARWIN_X86_64 ;;
    *) fail "No pinned cloudflared build for $(uname -s)-$(uname -m)." ;;
  esac

  mkdir -p "$WORK_DIR/bin"
  curl -fsSL --retry 3 --retry-delay 5 -o "$WORK_DIR/$asset" \
    "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/$asset"
  echo "$sha  $WORK_DIR/$asset" | shasum -a 256 -c -
  case "$asset" in
    *.tgz) tar -xzf "$WORK_DIR/$asset" -C "$WORK_DIR/bin" cloudflared ;;
    *) mv "$WORK_DIR/$asset" "$WORK_DIR/bin/cloudflared" ;;
  esac
  chmod +x "$WORK_DIR/bin/cloudflared"
  "$WORK_DIR/bin/cloudflared" --version
  [ -z "${GITHUB_PATH:-}" ] || echo "$WORK_DIR/bin" >> "$GITHUB_PATH"
}

client_key() {
  mkdir -p "$WORK_DIR/client" "$WORK_DIR/client-key"
  chmod 700 "$WORK_DIR/client"
  rm -f "$WORK_DIR/client/id_ed25519" "$WORK_DIR/client/id_ed25519.pub"
  ssh-keygen -q -t ed25519 -N '' -C e2e-webkit-test -f "$WORK_DIR/client/id_ed25519"
  cp "$WORK_DIR/client/id_ed25519.pub" "$WORK_DIR/client-key/id_ed25519.pub"
}

# The runtime config compose would give the pubky-app container, so the macOS app runs with the
# same values as the Docker app instead of a second copy that drifts from pubky-stack.
write_app_env() {
  local target=$1
  docker compose config --format json |
    jq '.services["pubky-app"].environment // {}
        | with_entries(select((.key | test("^PUBKY_RUNTIME_[A-Z0-9_]+$")) and .value != null))
        | with_entries(.value |= tostring)' > "$target"

  [ "$(jq 'length' "$target")" -gt 0 ] || fail "compose gives the pubky-app service no PUBKY_RUNTIME_* values."
  jq -e 'all(.[]; test("\n") | not)' "$target" >/dev/null || fail "A PUBKY_RUNTIME_* value spans several lines."
  echo "Runtime config for the app:"
  jq . "$target"
}

# Writes the ports to forward (forward-ports) and, of those, the ports the macOS job must see
# answering (ready-ports): the required ones, plus each other localhost port the app's runtime
# config names if something answers on it here. A port nothing listens on is still forwarded, so
# the app fails on it exactly as it would beside the stack, but it cannot be waited for.
select_ports() {
  local dir=$1 port names
  local -a forward=("${REQUIRED_PORTS[@]}") ready=("${REQUIRED_PORTS[@]}") named=()
  read -r -a named <<< "$(jq -r '.[]' "$dir/app-env.json" | grep -oE '(localhost|127\.0\.0\.1):[0-9]+' |
    cut -d: -f2 | sort -un | tr '\n' ' ' || true)"
  for port in "${named[@]}"; do
    case " ${REQUIRED_PORTS[*]} ${APP_URL##*:} " in
      *" $port "*) continue ;;
    esac
    forward+=("$port")
    names=$(jq -r --arg port "$port" \
      'to_entries | map(select(.value | test("(localhost|127\\.0\\.0\\.1):" + $port + "([^0-9]|$)")) | .key) | join(", ")' \
      "$dir/app-env.json")
    if wait_for_ports 15 "$port" >/dev/null; then
      ready+=("$port")
    else
      echo "::notice::Nothing answers on localhost:$port ($names) on this runner. It is forwarded, but the macOS job does not wait for it."
    fi
  done
  echo "${forward[*]}" > "$dir/forward-ports"
  echo "${ready[*]}" > "$dir/ready-ports"
  echo "Forwarding port(s) ${forward[*]}; the macOS job waits for ${ready[*]}."
}

start_sshd() {
  local dir="$WORK_DIR/server" sshd port permit_open=""
  local -a forward=()
  read -r -a forward < "$WORK_DIR/endpoint/forward-ports"
  sshd=$(command -v sshd || echo /usr/sbin/sshd)
  if [ ! -x "$sshd" ]; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq --no-install-recommends openssh-server
  fi

  ssh-keygen -q -t ed25519 -N '' -C e2e-webkit-stack -f "$dir/host_ed25519"
  for port in "${forward[@]}"; do
    permit_open="$permit_open 127.0.0.1:$port"
  done

  # Runs as this user, not root: it can then only ever log this user in, and needs no PAM.
  cat > "$dir/sshd_config" <<EOF
Port $SSH_PORT
ListenAddress 127.0.0.1
HostKey $dir/host_ed25519
PidFile $dir/sshd.pid
AuthorizedKeysFile $dir/authorized_keys
AuthenticationMethods publickey
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
AllowUsers $(id -un)
AllowTcpForwarding local
PermitOpen$permit_open
ForceCommand /bin/false
PermitTTY no
PermitUserRC no
PermitTunnel no
GatewayPorts no
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 15
ClientAliveCountMax 4
LogLevel VERBOSE
EOF
  "$sshd" -t -f "$dir/sshd_config"
  "$sshd" -f "$dir/sshd_config" -E "$LOG_DIR/sshd.log"
}

# Quick tunnels are rate limited and now and then fail to register, so try a few times; later
# attempts force HTTP/2 in case the runner's network drops QUIC.
# A quick tunnel's hostname takes a few seconds to appear in DNS, and a resolver that asks too
# early caches the miss for a minute. Asking over DNS-over-HTTPS leaves no such entry in a runner's
# resolver, so the hostname is only handed to the macOS job once it resolves. Not fatal: the macOS
# job retries its connection anyway.
wait_for_tunnel_dns() {
  local deadline=$((SECONDS + 60))
  until curl -s --max-time 5 -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$1&type=A" |
    jq -e '.Status == 0 and ((.Answer // []) | length > 0)' >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::warning::$1 does not resolve yet; the macOS job will keep retrying."
      return 0
    fi
    sleep 2
  done
  echo "$1 resolves."
}

start_quick_tunnel() {
  local dir="$WORK_DIR/server" log="$LOG_DIR/cloudflared.log" attempt protocol deadline host
  for attempt in 1 2 3; do
    : > "$log"
    protocol=""
    [ "$attempt" -eq 1 ] || protocol="--protocol http2"
    # shellcheck disable=SC2086 # deliberately split into the flag and its value
    nohup cloudflared tunnel --no-autoupdate $protocol --url "tcp://127.0.0.1:$SSH_PORT" >> "$log" 2>&1 < /dev/null &
    echo $! > "$dir/cloudflared.pid"

    deadline=$((SECONDS + 60))
    while [ "$SECONDS" -lt "$deadline" ] && kill -0 "$(cat "$dir/cloudflared.pid")" 2>/dev/null; do
      host=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -n 1 | sed 's#https://##' || true)
      if [ -n "$host" ] && grep -q 'Registered tunnel connection' "$log"; then
        echo "Quick tunnel registered: $host"
        wait_for_tunnel_dns "$host"
        echo "$host" > "$WORK_DIR/endpoint/tunnel-host"
        return 0
      fi
      sleep 2
    done

    echo "Quick tunnel attempt $attempt did not register:"
    tail -n 20 "$log"
    stop_process "$dir/cloudflared.pid"
    sleep $((attempt * 10))
  done
  fail "cloudflared could not open a quick tunnel."
}

expose() {
  require_env GH_TOKEN REPO RUN_ID RUN_ATTEMPT PEER_JOB CLIENT_KEY_ARTIFACT
  local dir="$WORK_DIR/server"
  rm -rf "$dir" "$WORK_DIR/endpoint"
  mkdir -p "$dir" "$WORK_DIR/endpoint"
  chmod 700 "$dir"

  write_app_env "$WORK_DIR/endpoint/app-env.json"
  wait_for_ports 120 "${REQUIRED_PORTS[@]}" || fail "The stack is not answering on every port the macOS job needs."
  select_ports "$WORK_DIR/endpoint"

  wait_for_artifact "$CLIENT_KEY_ARTIFACT" "$dir/client-key" "${CLIENT_KEY_TIMEOUT:-900}"
  ssh-keygen -l -f "$dir/client-key/id_ed25519.pub" >/dev/null || fail "$CLIENT_KEY_ARTIFACT does not hold a public key."
  cp "$dir/client-key/id_ed25519.pub" "$dir/authorized_keys"
  chmod 600 "$dir/authorized_keys"

  start_sshd
  echo "$SSH_ALIAS $(cut -d' ' -f1,2 "$dir/host_ed25519.pub")" > "$WORK_DIR/endpoint/known_hosts"
  id -un > "$WORK_DIR/endpoint/ssh-user"
  start_quick_tunnel
}

hold() {
  require_env GH_TOKEN REPO RUN_ID RUN_ATTEMPT PEER_JOB
  local dir="$WORK_DIR/server" deadline=$((SECONDS + ${HOLD_TIMEOUT:-3000})) state
  while true; do
    state=$(peer_state)
    case "$state" in
      completed:success)
        echo "\"$PEER_JOB\" passed."
        return 0
        ;;
      completed:*) fail "\"$PEER_JOB\" ended as $state." ;;
    esac
    kill -0 "$(cat "$dir/cloudflared.pid")" 2>/dev/null || fail "cloudflared exited; the macOS job has lost the stack."
    kill -0 "$(cat "$dir/sshd.pid")" 2>/dev/null || fail "sshd exited; the macOS job has lost the stack."
    [ "$SECONDS" -lt "$deadline" ] || fail "\"$PEER_JOB\" is still $state after $((${HOLD_TIMEOUT:-3000} / 60)) minutes (jobs: $(job_names))."
    echo "Stack is up; \"$PEER_JOB\" is $state."
    sleep 30
  done
}

connect() {
  require_env GH_TOKEN REPO RUN_ID RUN_ATTEMPT PEER_JOB ENDPOINT_ARTIFACT CYPRESS_PORT
  local dir="$WORK_DIR/endpoint" host user port ports
  local -a forwards=() forward=() ready=() routes=("$APP_PORT:$((APP_PORT + LOCAL_PORT_OFFSET))")
  wait_for_artifact "$ENDPOINT_ARTIFACT" "$dir" "${ENDPOINT_TIMEOUT:-1200}"

  host=$(cat "$dir/tunnel-host")
  user=$(cat "$dir/ssh-user")
  [[ "$host" =~ ^[a-z0-9-]+\.trycloudflare\.com$ ]] || fail "Unexpected tunnel host: $host"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "Unexpected SSH user: $user"
  for ports in forward-ports ready-ports; do
    [[ "$(cat "$dir/$ports")" =~ ^[0-9]+(\ [0-9]+)*$ ]] || fail "Unexpected $ports: $(cat "$dir/$ports")"
  done
  read -r -a forward < "$dir/forward-ports"
  read -r -a ready < "$dir/ready-ports"
  for port in "${forward[@]}"; do
    [ "$port" -le $((65535 - LOCAL_PORT_OFFSET)) ] || fail "Port $port is too high to move up by $LOCAL_PORT_OFFSET."
    forwards+=(-L "127.0.0.1:$((port + LOCAL_PORT_OFFSET)):127.0.0.1:$port")
    routes+=("$port:$((port + LOCAL_PORT_OFFSET))")
  done

  nohup node "$SCRIPT_DIR/e2e-loopback-demux.mjs" "$CYPRESS_PORT" "${routes[@]}" > "$LOG_DIR/demux.log" 2>&1 < /dev/null &
  echo $! > "$WORK_DIR/client/demux.pid"

  # The loop reopens the tunnel if the connection drops mid-run.
  nohup bash -c 'while true; do "$@"; echo "Tunnel closed (exit $?); reconnecting."; sleep 3; done' tunnel \
    ssh -F /dev/null -N -T \
    -i "$WORK_DIR/client/id_ed25519" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o UserKnownHostsFile="$dir/known_hosts" -o GlobalKnownHostsFile=/dev/null \
    -o StrictHostKeyChecking=yes -o HostKeyAlias="$SSH_ALIAS" \
    -o ProxyCommand="cloudflared access tcp --hostname $host" \
    -o ExitOnForwardFailure=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
    "${forwards[@]}" "$user@$SSH_ALIAS" > "$LOG_DIR/tunnel.log" 2>&1 < /dev/null &
  echo $! > "$WORK_DIR/client/tunnel.pid"

  wait_for_ports 180 "${ready[@]}" || {
    cat "$LOG_DIR/demux.log" "$LOG_DIR/tunnel.log"
    fail "The stack is not reachable through the tunnel."
  }
  echo "Forwarded port(s) ${forward[*]}; the stack answers on localhost port(s) ${ready[*]}."
}

start_app() {
  local env_file="$WORK_DIR/endpoint/app-env.json" pair pid deadline=$((SECONDS + 120))
  while IFS= read -r pair; do
    # shellcheck disable=SC2163 # exports the NAME=value held in $pair
    export "$pair"
  done < <(jq -r 'to_entries[] | select(.key | test("^PUBKY_RUNTIME_[A-Z0-9_]+$")) | "\(.key)=\(.value)"' "$env_file")

  PORT=$((APP_PORT + LOCAL_PORT_OFFSET)) nohup npm run start > "$LOG_DIR/app.log" 2>&1 < /dev/null &
  pid=$!
  echo "$pid" > "$WORK_DIR/client/app.pid"

  until curl -fs -o /dev/null "$APP_URL/"; do
    if ! kill -0 "$pid" 2>/dev/null || [ "$SECONDS" -ge "$deadline" ]; then
      cat "$LOG_DIR/app.log"
      fail "The app did not become ready at $APP_URL."
    fi
    sleep 2
  done
  echo "The app is ready at $APP_URL."
}

# Stops what this script left running and prints its logs.
close() {
  local pid_file log
  for pid_file in "$WORK_DIR"/client/*.pid "$WORK_DIR"/server/*.pid; do
    stop_process "$pid_file"
  done
  for log in "$LOG_DIR"/*.log; do
    [ -f "$log" ] || continue
    echo "::group::$(basename "$log")"
    cat "$log"
    echo "::endgroup::"
  done
}

case "${1:-}" in
  install-cloudflared) install_cloudflared ;;
  client-key) client_key ;;
  expose) expose ;;
  hold) hold ;;
  connect) connect ;;
  start-app) start_app ;;
  close) close ;;
  *) fail "Usage: $0 install-cloudflared | client-key | expose | hold | connect | start-app | close" ;;
esac
