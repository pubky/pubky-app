import { z } from 'zod';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { getMarketplaceUrl } from '@/libs/runtime-config/runtime-config';
import { LocalAuthService } from '@/services/local/auth/auth';

// Shared deployment contract with Shop; see ADR 0025. Never enumerate/delete other databases.
const PRIVATE_TABLES = [
  'user_relationships',
  'user_connections',
  'user_tags',
  'notifications',
  'post_tags',
  'post_streams',
  'unread_post_streams',
  'user_streams',
  'bookmarks',
  'commerce_listing_drafts',
  'commerce_sync_jobs',
  'commerce_reviews',
  'commerce_review_responses',
  'commerce_favorites',
  'commerce_shop_follows',
  'commerce_cart_items',
  'commerce_locks_correlations',
  'commerce_watch_snapshots',
  'commerce_watch_tombstones',
  'commerce_watch_alerts',
  'commerce_saved_searches',
  'commerce_activity_checkpoints',
  'commerce_shipping_presets',
  'commerce_messaging_receivers',
  'commerce_messaging_links',
  'commerce_messaging_conversations',
  'commerce_messaging_messages',
  'commerce_messaging_outbox',
  'commerce_messaging_unprocessed',
  'marketplace_tags',
  'hot_tags',
  'feeds',
  'moderation',
  'commerce_import_manifests',
  'commerce_import_rows',
  'commerce_import_mappings',
  'commerce_webhooks',
  'chat_identity',
  'chat_conversations',
  'chat_messages',
  'chat_sync_state',
];
// Records of the bearers Shop holds for the marketplace service: the purchase session and the Studio session.
const MARKETPLACE_SESSION_KEYS = ['pubky.marketplace.session.v1', 'pubky.marketplace.inventory-session.v1'];
const SERVICE_KEYS = [
  ...MARKETPLACE_SESSION_KEYS,
  'pubky.marketplace.locks-frontend-session.v1',
  'pubky.messaging.session.v1',
  'shop-chat-inbox-session:v1',
];
const TEARDOWN_PENDING = 'pubky-messaging-keys-teardown-pending';
const CLEANUP_TIMEOUT_MS = 4000;

// The service issues 32-byte URL-safe base64 bearers and canonical lowercase uuid text session ids. The records
// are written by Shop, possibly an older build or another tab, so each field is checked before it is sent.
const heldMarketplaceSessionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  sessionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  expiresAt: z.string().optional(),
});
type HeldMarketplaceSession = z.infer<typeof heldMarketplaceSessionSchema>;

/** Shop BFF readiness and best-effort logout cleanup; the durable epoch keeps failed cleanup retryable. */
export class ShopEmbedService {
  private constructor() {}

  /** Read-only BFF readiness, independent of the user's grant or marketplace session. */
  static async fetchAvailability(signal: AbortSignal): Promise<boolean> {
    const url = '/shop-embed/api/marketplace/health';
    const timeout = new AbortController();
    // Forward cancellation explicitly: older Safari does not implement AbortSignal.any.
    const cancel = () => timeout.abort();
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => timeout.abort(), 5000);
    try {
      const response = await safeFetch(
        url,
        {
          method: HttpMethod.GET,
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: timeout.signal,
        },
        ErrorService.Shop,
        'fetchAvailability',
      );
      // An unavailable BFF is the endpoint's expected health state, not an auth error.
      if (response.status === 503) return false;
      if (!response.ok) throw httpResponseToError(response, ErrorService.Shop, 'fetchAvailability', url);
      // A proxy's HTML 200 or an older Shop build must never count as ready.
      if (!response.headers.get('content-type')?.includes('application/json')) return false;
      const body: unknown = await response.json().catch(() => null);
      return (
        typeof body === 'object' &&
        body !== null &&
        'service' in body &&
        body.service === 'pubky-shop-bff' &&
        'status' in body &&
        body.status === 'ready'
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }

  static async cleanupSignedOut(generation: string, epoch: string): Promise<void> {
    if (!epoch || typeof window === 'undefined') return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CLEANUP_TIMEOUT_MS);
    const isCurrent = () => {
      if (abort.signal.aborted) return false;
      try {
        const current = LocalAuthService.read();
        return current?.generation === generation && current.shopCleanupEpoch === epoch && !current.currentUserPubky;
      } catch {
        return false;
      }
    };
    try {
      if (!isCurrent()) return;
      const locks = navigator.locks;
      // Without the shared fence, a delayed old cleanup could erase a newly restored Shop session.
      if (!locks?.request) return;
      await locks.request('pubky-shop-host-cleanup', { signal: abort.signal }, async () => {
        if (!isCurrent()) return;
        if (localStorage.getItem('shop-host-cleanup-epoch-v1') === epoch && !localStorage.getItem(TEARDOWN_PENDING))
          return;
        // The bearers exist only in these records once Shop's frame is gone, so read them before they are removed.
        const held = this.readHeldMarketplaceSessions();
        for (const key of SERVICE_KEYS) localStorage.removeItem(key);
        localStorage.setItem(TEARDOWN_PENDING, '1');
        await Promise.allSettled([
          locks.request('pubky-messaging-keys', { signal: abort.signal }, async () => {
            if (!isCurrent()) return;
            const cleared = await this.clearStores('shop-franky', PRIVATE_TABLES, isCurrent, abort.signal);
            if (!cleared || !isCurrent()) return;
            const keyCleared = await this.clearStores(
              'shop-franky-messaging-keyring',
              ['wrapping-key'],
              isCurrent,
              abort.signal,
              ['wrapping-key', 'wrapping-key-epoch'],
            );
            if (keyCleared && isCurrent()) localStorage.removeItem(TEARDOWN_PENDING);
          }),
          // Existing Shop BFF owns the HttpOnly session and flow cookies. No App SDK grant is removed here.
          this.clearSession(abort.signal),
          this.revokeMarketplaceSessions(held, abort.signal),
        ]);
      });
    } catch {
      // Offline/blocked storage/lock timeout: the persisted epoch is retried on return to Shop.
    } finally {
      clearTimeout(timer);
    }
  }

  /** Distinct, unexpired bearers that the persisted purchase and Studio records can still address at the service. */
  private static readHeldMarketplaceSessions(): HeldMarketplaceSession[] {
    const held = new Map<string, HeldMarketplaceSession>();
    for (const key of MARKETPLACE_SESSION_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        continue;
      }
      // A record without a session id comes from a service that predates it and cannot be addressed.
      const parsed = heldMarketplaceSessionSchema.safeParse(value);
      if (!parsed.success) continue;
      const expiresAtMs = parsed.data.expiresAt === undefined ? Number.NaN : Date.parse(parsed.data.expiresAt);
      if (expiresAtMs <= Date.now()) continue;
      held.set(parsed.data.token, parsed.data);
    }
    return [...held.values()];
  }

  /**
   * Ends held marketplace sessions at the service. The service keeps a session valid until its TTL unless it
   * is revoked, so deleting the record from the browser leaves a copied bearer usable. Failures are reported
   * by the shared factories and never stop the rest of the logout cleanup.
   */
  private static async revokeMarketplaceSessions(held: HeldMarketplaceSession[], signal: AbortSignal): Promise<void> {
    if (!held.length) return;
    const origin = getMarketplaceUrl();
    if (!origin) {
      Logger.warn('Marketplace URL is not configured; Shop marketplace sessions will expire on their own');
      return;
    }
    await Promise.allSettled(
      held.map(async ({ token, sessionId }) => {
        const url = `${origin.replace(/\/+$/, '')}/v1/auth/sessions/${sessionId}`;
        const response = await safeFetch(
          url,
          {
            method: HttpMethod.DELETE,
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
            credentials: 'omit',
            // Lets the request outlive a page that is torn down right after sign-out.
            keepalive: true,
            signal,
          },
          ErrorService.Shop,
          'revokeMarketplaceSession',
        );
        // The bearer authenticates its own revocation, so an unknown session (401, 404) is already ended.
        if (
          response.ok ||
          response.status === HttpStatusCode.UNAUTHORIZED ||
          response.status === HttpStatusCode.NOT_FOUND
        )
          return;
        throw httpResponseToError(response, ErrorService.Shop, 'revokeMarketplaceSession', url);
      }),
    );
  }

  private static async clearSession(signal: AbortSignal): Promise<void> {
    const url = '/shop-embed/api/marketplace/session';
    const response = await safeFetch(
      url,
      { method: HttpMethod.DELETE, credentials: 'same-origin', signal },
      ErrorService.Shop,
      'cleanupSignedOut',
    );
    if (!response.ok) {
      // The shared factories report once; allSettled keeps logout best-effort and the epoch pending.
      throw httpResponseToError(response, ErrorService.Shop, 'cleanupSignedOut', url);
    }
  }

  private static clearStores(
    name: string,
    tables: string[],
    isCurrent: () => boolean,
    signal: AbortSignal,
    keys?: string[],
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!isCurrent()) return resolve(false);
      let db: IDBDatabase | undefined;
      let transaction: IDBTransaction | undefined;
      let done = false;
      const finish = (success: boolean) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', cancel);
        db?.close();
        resolve(success);
      };
      const cancel = () => {
        try {
          transaction?.abort();
        } catch {
          /* Already completed. */
        }
        finish(false);
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => {
          // An absent Shop database needs no cleanup; never create a database or change its schema.
          request.transaction?.abort();
          finish(true);
        };
        request.onerror = () => finish(false);
        request.onblocked = () => finish(false);
        request.onsuccess = () => {
          db = request.result;
          if (done || !isCurrent()) {
            db.close();
            finish(false);
            return;
          }
          const existing = tables.filter((table) => db!.objectStoreNames.contains(table));
          if (!existing.length) return finish(true);
          try {
            transaction = db.transaction(existing, 'readwrite');
            transaction.oncomplete = () => finish(true);
            transaction.onerror = () => finish(false);
            transaction.onabort = () => finish(false);
            for (const table of existing) {
              const store = transaction.objectStore(table);
              if (keys) for (const key of keys) store.delete(key);
              else store.clear();
            }
          } catch {
            finish(false);
          }
        };
      } catch {
        finish(false);
      }
    });
  }
}
