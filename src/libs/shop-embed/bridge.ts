import { AUTH_ROUTES } from '@/app/routes';
import type { AuthState } from '@/stores/auth/auth.types';

const SHOP_EMBED_PREFIX = '/shop-embed';
export const SHOP_SESSION_CHANNEL = 'pubky-shop-session';
export const SHOP_SESSION_VERSION = 1;

type ShopSessionSnapshot = {
  generation: string;
  shopCleanupEpoch: string;
  status: 'ready' | 'signed-out' | 'restoring' | 'temporary-error' | 'reauth-required';
  pubky: string | null;
  sessionStoreId: string | null;
  grantId: string | null;
  clientId: string | null;
};

type ShopRequest = {
  channel: typeof SHOP_SESSION_CHANNEL;
  version: typeof SHOP_SESSION_VERSION;
} & (
  | { type: 'ready' | 'request-login' | 'request-capabilities' | 'request-logout' | 'request-retry' }
  | { type: 'navigate'; path: string }
);

/** Never accept authority, secrets, or scopes from the child. */
export function parseShopRequest(value: unknown): ShopRequest | null {
  if (!value || typeof value !== 'object') return null;
  if (!('channel' in value) || value.channel !== SHOP_SESSION_CHANNEL) return null;
  if (!('version' in value) || value.version !== SHOP_SESSION_VERSION || !('type' in value)) return null;
  const keys = Object.keys(value).sort().join(',');
  if (value.type === 'navigate') {
    if (keys !== 'channel,path,type,version' || !('path' in value) || typeof value.path !== 'string') return null;
    return { channel: SHOP_SESSION_CHANNEL, version: SHOP_SESSION_VERSION, type: 'navigate', path: value.path };
  }
  if (keys !== 'channel,type,version') return null;
  if (
    !['ready', 'request-login', 'request-capabilities', 'request-logout', 'request-retry'].includes(String(value.type))
  )
    return null;
  return value as ShopRequest;
}

/** Projection deliberately excludes the SDK Session and all bearer/proof-key material. */
export function getShopSessionSnapshot(state: AuthState): ShopSessionSnapshot {
  let status: ShopSessionSnapshot['status'];
  if (!state.hasHydrated || state.isRestoringSession || state.isLoggingOut) status = 'restoring';
  else if (state.restoreStatus === 'temporary-error' || state.restoreStatus === 'reauth-required')
    status = state.restoreStatus;
  else if (!state.sessionReference) status = 'signed-out';
  else if (state.needsAccountSync) status = 'restoring';
  else if (state.restoreStatus === 'ready' && state.session && state.sessionReference && state.currentUserPubky)
    status = 'ready';
  else status = 'restoring';
  const reference = state.currentUserPubky ? state.sessionReference : null;
  return {
    generation: state.generation,
    shopCleanupEpoch: state.shopCleanupEpoch ?? '',
    status,
    pubky: status === 'signed-out' ? null : state.currentUserPubky,
    sessionStoreId: reference?.sessionStoreId ?? null,
    grantId: reference?.grantId ?? null,
    clientId: reference?.clientId ?? null,
  };
}

/** Exact origin AND exact WindowProxy are needed; another same-origin frame is not this Shop. */
export function isShopMessageSource(event: MessageEvent, child: Window | null, origin: string): boolean {
  return child !== null && event.origin === origin && event.source === child;
}

/** Reject ambiguous paths before URL normalization (including encoded traversal/separators). */
function safePath(path: string, prefix: string): URL | null {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(path)) return null;
  const pathname = path.split(/[?#]/, 1)[0];
  try {
    const decoded = decodeURIComponent(pathname);
    if (/%(?:2f|5c|3f|23|25)/i.test(pathname) || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    if (decoded.split('/').some((part) => part === '.' || part === '..')) return null;
    const url = new URL(path, 'https://shop.invalid');
    if (url.origin !== 'https://shop.invalid') return null;
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
    return url;
  } catch {
    return null;
  }
}

function isDocumentPath(suffix: string): boolean {
  return !/^\/(?:api|_next)(?:\/|$)/.test(decodeURIComponent(suffix));
}

export function shopFramePath(outerPath: string): string | null {
  const url = safePath(outerPath, '/shop');
  if (!url) return null;
  const suffix = url.pathname.slice('/shop'.length);
  if (!isDocumentPath(suffix)) return null;
  return `${SHOP_EMBED_PREFIX}${suffix && suffix !== '/' ? suffix : '/marketplace'}${url.search}${url.hash}`;
}

export function shopHostPath(innerPath: string): string | null {
  const url = safePath(innerPath, SHOP_EMBED_PREFIX);
  if (!url) return null;
  const suffix = url.pathname.slice(SHOP_EMBED_PREFIX.length);
  // Inner APIs/assets are never App pages and must not become navigable outer routes.
  if (!isDocumentPath(suffix)) return null;
  return `/shop${suffix === '/marketplace' || suffix === '/' ? '' : suffix}${url.search}${url.hash}`;
}

/** A login return is restricted to the public Shop wrapper, never an arbitrary redirect. */
export function shopSignInReturn(search: string): string | null {
  const returnTo = new URLSearchParams(search).get('returnTo');
  if (!returnTo) return null;
  const inner = shopFramePath(returnTo);
  return inner ? shopHostPath(inner) : null;
}

/** The host's generation identifies the grant the user explicitly wants to replace. */
export function shopSignInPath(outerPath: string, generation: string): string | null {
  const returnTo = shopSignInReturn(new URLSearchParams({ returnTo: outerPath }).toString());
  return returnTo ? `${AUTH_ROUTES.SIGN_IN}?${new URLSearchParams({ returnTo, shopReauth: generation })}` : null;
}

/** Expire the sign-in exception as soon as App adopts a newly approved grant. */
export function isShopReauthorization(search: string, generation: string): boolean {
  const params = new URLSearchParams(search);
  return shopSignInReturn(search) !== null && params.has('shopReauth') && params.get('shopReauth') === generation;
}
