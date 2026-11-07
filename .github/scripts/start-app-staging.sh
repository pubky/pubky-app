#!/usr/bin/env bash
# Starts the pubky-app production server against the STAGING backend and waits
# for http://localhost:3000 to answer. Run from the repository root, after
# `npm ci` and `npm run build`.
#
# The values mirror the build.yml smoke test and the staging defaults in
# src/libs/runtime-config/runtime-config.schema.ts. All nine required network
# values are set on purpose: the strict runtime parse (runtimeEnvInputSchema)
# fails loudly on a partial config. Optional-tier values the specs never touch
# (Passport, Locks, Sentry, ...) stay unset, so those features keep their
# disabled/default behaviour.
set -euo pipefail

export PUBKY_RUNTIME_ENV="staging"
export PUBKY_RUNTIME_NEXUS_URL="https://nexus.staging.pubky.app"
export PUBKY_RUNTIME_CDN_URL="https://nexus.staging.pubky.app/static"
export PUBKY_RUNTIME_HOMESERVER="ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy"
export PUBKY_RUNTIME_HOMESERVER_URL="https://homeserver.staging.pubky.app"
export PUBKY_RUNTIME_HOMEGATE_URL="https://homegate.staging.pubky.app"
export PUBKY_RUNTIME_DEFAULT_HTTP_RELAY="https://httprelay.staging.pubky.app/inbox"
export PUBKY_RUNTIME_PKARR_RELAYS='["https://pkarr.pubky.app","https://pkarr.pubky.org"]'
export PUBKY_RUNTIME_TESTNET="false"
# Not read by the app any more (ADR 0025); exported for parity with build.yml.
export PUBKY_RUNTIME_SHOP_URL="https://shop.staging.pubky.app/marketplace"
# Poll Nexus for notifications more often than the 8888ms app default so specs
# do not sit on multi-second poll ticks between actions (same as e2e-test.yml).
export PUBKY_RUNTIME_NOTIFICATION_POLL_INTERVAL_MS="2000"

# Guard against a future edit blanking one of the required values above.
for var in \
  PUBKY_RUNTIME_ENV \
  PUBKY_RUNTIME_NEXUS_URL \
  PUBKY_RUNTIME_CDN_URL \
  PUBKY_RUNTIME_HOMESERVER \
  PUBKY_RUNTIME_HOMESERVER_URL \
  PUBKY_RUNTIME_HOMEGATE_URL \
  PUBKY_RUNTIME_DEFAULT_HTTP_RELAY \
  PUBKY_RUNTIME_PKARR_RELAYS \
  PUBKY_RUNTIME_TESTNET; do
  if [ -z "${!var:-}" ]; then
    echo "Required staging value $var is empty."
    exit 1
  fi
done

APP_LOG="app.log"
PORT=3000
MAX_WAIT=120
WAIT_INTERVAL=2
ELAPSED=0

# nohup + background: the server must outlive this step so the Cypress step
# can drive it. The runner tears it down at the end of the job.
nohup npm run start >"$APP_LOG" 2>&1 &
SERVER_PID=$!

while ! curl -fsS "http://localhost:${PORT}/" > /dev/null; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "App server exited unexpectedly (PID ${SERVER_PID})."
    echo "--- ${APP_LOG} ---"
    cat "$APP_LOG"
    exit 1
  fi
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "App server did not become ready within ${MAX_WAIT}s."
    echo "--- ${APP_LOG} ---"
    cat "$APP_LOG"
    exit 1
  fi
  echo "Waiting for http://localhost:${PORT}/ ... (${ELAPSED}s)"
  sleep "$WAIT_INTERVAL"
  ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

echo "App server is ready on http://localhost:${PORT} (staging backend)."
