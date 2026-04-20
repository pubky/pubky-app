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
ARG NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL_MS
ARG NEXT_PUBLIC_NOTIFICATION_POLL_ON_START
ARG NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY
ARG NEXT_PUBLIC_STREAM_POLL_INTERVAL_MS
ARG NEXT_PUBLIC_STREAM_POLL_ON_START
ARG NEXT_PUBLIC_STREAM_RESPECT_PAGE_VISIBILITY
ARG NEXT_PUBLIC_STREAM_FETCH_LIMIT
ARG NEXT_PUBLIC_STREAM_CACHE_MAX_AGE_MS
ARG NEXT_MAX_STREAM_TAGS
ARG NEXT_PUBLIC_TTL_POST_MS
ARG NEXT_PUBLIC_TTL_USER_MS
ARG NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS
ARG NEXT_PUBLIC_TTL_POST_MAX_BATCH_SIZE
ARG NEXT_PUBLIC_TTL_USER_MAX_BATCH_SIZE
ARG NEXT_PUBLIC_TTL_RETRY_DELAY_MS
ARG NEXT_PUBLIC_HOMESERVER
ARG NEXT_PUBLIC_NEXUS_URL
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_PUBLIC_TESTNET
ARG NEXT_PUBLIC_PKARR_RELAYS
ARG NEXT_PUBLIC_DEFAULT_HTTP_RELAY
ARG NEXT_PUBLIC_EXCHANGE_RATE_API
ARG NEXT_PUBLIC_HOMEGATE_URL
ARG NEXT_PUBLIC_PRELUDE_SDK_KEY
ARG NEXT_PUBLIC_MODERATION_ID
ARG NEXT_PUBLIC_MODERATED_TAGS
ARG BASE_URL_SUPPORT
ARG SUPPORT_API_ACCESS_TOKEN
ARG SUPPORT_ACCOUNT_ID
ARG SUPPORT_FEEDBACK_INBOX_ID

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Enable standalone output for Docker builds
ENV NEXT_STANDALONE=true

# Build the application
RUN npm run build

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
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the default Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the standalone server
CMD ["node", "server.js"]
