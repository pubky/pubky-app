# Stage 1: Dependencies
FROM node:lts-alpine AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Stage 2: Builder
FROM node:lts-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Declare build arguments for Next.js public env vars (baked at build time)
# All have defaults for simplicity - can be overridden if needed
ARG NEXT_PUBLIC_DB_VERSION
ARG NEXT_PUBLIC_DB_NAME
ARG NEXT_PUBLIC_DEBUG_MODE
ARG NEXT_PUBLIC_APP_VERSION
# NOTE: NEXUS_URL, CDN_URL, HOMESERVER, HOMESERVER_URL, HOMEGATE_URL, DEFAULT_HTTP_RELAY,
# PKARR_RELAYS and TESTNET are intentionally NOT build args. They are runtime-configurable and must
# be supplied as PUBKY_RUNTIME_* environment variables on the running container (see runner stage
# and src/libs/runtime-config). This lets a single image be promoted across staging/prod/testnet.
ARG BASE_URL_SUPPORT
ARG SUPPORT_API_ACCESS_TOKEN
ARG SUPPORT_ACCOUNT_ID
ARG SUPPORT_FEEDBACK_INBOX_ID

# NOTE: Sentry runtime values (DSN, environment, sample rates) are runtime-configurable
# (PUBKY_RUNTIME_SENTRY_*, see runner stage). Source-map upload is optional: Synonym CI passes
# Sentry build credentials, while third-party public image builds skip upload and still succeed.

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Enable standalone output for Docker builds
ENV NEXT_STANDALONE=true

# Build the application
RUN npm run build

# Inject Sentry Debug IDs into the built chunks and their source maps (deterministic, offline,
# no credentials). The shipped JS must carry the same Debug IDs as the maps the CI pipeline
# uploads — that pipeline extracts the maps from THIS stage (docker build --target builder),
# so it must not re-inject. Browser maps are stripped from the runner stage below.
# The standalone tree needs its own pass: sentry-cli skips hidden directories while walking,
# so the nested .next/standalone/.next is missed by the first command. IDs are derived from
# file content, so the standalone copies receive the exact same IDs as the originals.
RUN npx sentry-cli sourcemaps inject .next \
    && npx sentry-cli sourcemaps inject .next/standalone/.next

ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
RUN if [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ] && [ -n "$SENTRY_PROJECT" ]; then \
      npx sentry-cli sourcemaps upload --release="$NEXT_PUBLIC_APP_VERSION" .next; \
    else \
      echo "Skipping Sentry source-map upload; Sentry build credentials not set."; \
    fi

# Strip browser source maps from the public image: the chunks keep their injected Debug IDs
# (enough for Sentry to match the maps uploaded by the CI pipeline), and the maps themselves
# must not be served from /_next/static. Server-side maps under .next/standalone stay — they
# are never exposed over HTTP and make Node stack traces readable.
RUN find .next/static -name '*.map' -type f -delete

# Stage 3: Runner
FROM node:lts-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# 1. Copy standalone server files (Next.js automatically links to .next/static from here)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 2. Copy the client-side static assets from the root .next/static folder
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the default Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Runtime configuration (PUBLIC values, NOT secrets) is supplied per-environment at container
# runtime (Ansible / docker compose / k8s). With NODE_ENV=production the app fails fast (at boot)
# if any of the REQUIRED network values are missing rather than silently falling back to staging
# defaults. Optional/defaulted PUBKY_RUNTIME_* values can override deployer-facing public config
# without rebuilding the image. See docs/environment.md and src/libs/runtime-config.
#
# Required:
#   PUBKY_RUNTIME_NEXUS_URL
#   PUBKY_RUNTIME_CDN_URL
#   PUBKY_RUNTIME_HOMESERVER
#   PUBKY_RUNTIME_HOMESERVER_URL
#   PUBKY_RUNTIME_HOMEGATE_URL
#   PUBKY_RUNTIME_DEFAULT_HTTP_RELAY
#   PUBKY_RUNTIME_PKARR_RELAYS   (JSON array string, e.g. '["https://pkarr.pubky.app"]')
#   PUBKY_RUNTIME_TESTNET        ("true" | "false")
#
# Optional (absent DSN disables Sentry entirely; rates have defaults 0.1 / 0.0 / 1.0):
#   PUBKY_RUNTIME_SENTRY_DSN
#   PUBKY_RUNTIME_SENTRY_ENVIRONMENT
#   PUBKY_RUNTIME_SENTRY_TRACES_SAMPLE_RATE
#   PUBKY_RUNTIME_SENTRY_REPLAYS_SESSION_SAMPLE_RATE
#   PUBKY_RUNTIME_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE

# Run the standalone server
CMD ["node", "server.js"]
