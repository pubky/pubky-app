#!/usr/bin/env bash
# Turns Locks on for the pubky-app container of the Locks spec job (cypress/e2e/locks.cy.ts) only.
#
# Locks is off unless both a Lock Server and a Paykit Server are configured. Neither runs in CI (nor
# do Pubky Ring and Bitkit), so the app gets placeholders for both and PUBKY_RUNTIME_E2E_LOCKS_STUB_URL,
# which swaps the Locks SDK client for the test-only stub (src/core/services/locks/locks.e2eStub.ts).
# The spec answers the stub's calls with cy.intercept; the stub host never resolves. Keep the stub URL
# in step with `locksStubUrl` in cypress/cypress.config.ts.
#
# Appends to the docker-compose.override.yml the "Prepare pubky-stack .env" step wrote, in the
# working directory (pubky-stack/docker).
set -euo pipefail

override=docker-compose.override.yml
if ! grep -q '^    environment:$' "$override"; then
  echo "$override has no pubky-app environment block to extend"
  exit 1
fi

# The Lock Server pubky only has to be a valid key: the stub never contacts it.
cat >> "$override" <<'EOF'
      PUBKY_RUNTIME_LOCK_SERVER: "67xa7bynjmbncn1rt6jshrjsdkyzfetoochk47tt684tb8uegm8o"
      PUBKY_RUNTIME_PAYKIT_SERVER_URL: "http://paykit.e2e.test"
      PUBKY_RUNTIME_E2E_LOCKS_STUB_URL: "http://lock-server.e2e.test"
EOF

cat "$override"
