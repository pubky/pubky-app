// =============================================================================
// NEW ERROR SYSTEM (Phase 1) - Category-based error types
// =============================================================================

/**
 * Error categories represent WHAT KIND of failure occurred.
 * Used for retry decisions, UI routing, and error handling logic.
 */
export enum ErrorCategory {
  Network = 'network', // Connection issues: DNS, offline, connection refused
  Timeout = 'timeout', // Request timeouts (408, network timeout)
  Server = 'server', // Server errors (5xx) from any remote service
  Client = 'client', // Client errors (4xx) - bad request, not found, conflict
  Auth = 'auth', // Authentication/authorization (401, 403)
  RateLimit = 'rateLimit', // Rate limiting (429) - special handling for retry-after
  Validation = 'validation', // Input validation failures (local, before request)
  Database = 'database', // Local storage failures (Dexie/IndexedDB)
}

/**
 * Services that can produce errors.
 * Used for logging context, NOT for error handling decisions.
 */
export enum ErrorService {
  Nexus = 'nexus',
  Homeserver = 'homeserver',
  Homegate = 'homegate',
  Exchangerate = 'exchangerate',
  Chatwoot = 'chatwoot',
  PubkyAppSpecs = 'pubky-app-specs',
  Local = 'local', // Client-side operations
  NextJsServer = 'nextjs-server', // Server-side operations
}
