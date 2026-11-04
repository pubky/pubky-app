/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * The Pubchi namespace is app.pubchi/v1; the service is changing in lockstep.
 * Do not redefine these contracts.
 */

/**
 * Graph paths from pubchi-design.md §3 and §5.
 * All durable Stage 4 state lives under bot identity B unless noted.
 */

export const PUBCHI_APP = 'app.pubchi' as const;
export const PUBCHI_EPOCH = 'v1' as const;
export const PUBKY_APP = 'pubky.app' as const;

export const PATHS = {
  bot: '/pub/app.pubchi/v1/bot.json',
  manifest: '/pub/app.pubchi/v1/manifest.json',
  config: '/pub/app.pubchi/v1/config.json',
  interests: '/pub/app.pubchi/v1/interests.json',
  formats: '/pub/app.pubchi/v1/formats.json',
  whatIMissedCursor: '/pub/app.pubchi/v1/cursors/what-i-missed.json',
  botProfile: '/pub/pubky.app/profile.json',
} as const;

export function feedDefinitionPath(feedId: string): string {
  return `/pub/app.pubchi/v1/feeds/${feedId}.json`;
}

export function followerSnapshotPath(unixSeconds: number): string {
  return `/pub/app.pubchi/v1/follower-snapshots/${unixSeconds}.json`;
}

export function requestBindingPath(requestId: string): string {
  return `/pub/app.pubchi/v1/requests/${requestId}.json`;
}

export function suggestionPath(suggestionId: string): string {
  return `/pub/app.pubchi/v1/suggestions/${suggestionId}.json`;
}

export function runReceiptPath(runId: string): string {
  return `/pub/app.pubchi/v1/runs/${runId}.json`;
}

/** U → B reciprocal owner binding (written with U's session). */
export function ownerBindingPath(bot: string): string {
  return `/pub/app.pubchi/v1/bots/${bot}.json`;
}

export function ownerBindingsUri(owner: string): string {
  return `pubky://${owner}/pub/app.pubchi/v1/bots/`;
}

export function ownerBindingUri(owner: string, bot: string): string {
  return `pubky://${owner}${ownerBindingPath(bot)}`;
}

export function botUri(owner: string): string {
  return `pubky://${owner}${PATHS.bot}`;
}

/**
 * B → U side: bot profile `automation.operator = U`.
 * Written with B's local session; not a second app.pubchi/v1 object.
 */
export function botProfileUri(bot: string): string {
  return `pubky://${bot}${PATHS.botProfile}`;
}

export function botObjectUri(bot: string, path: string): string {
  return `pubky://${bot}${path}`;
}

const FEED_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SNAPSHOT_ID = /^[0-9]{1,16}$/;

/** Stage 4 allowlist. Rejects `..`, encoded slashes, queries, foreign pubkys. */
export function isAllowlistedPath(path: string): boolean {
  if (path.includes('..') || path.includes('%') || path.includes('?') || path.includes('pubky://')) {
    return false;
  }
  if (path.includes('//') || path.includes('\\')) return false;
  switch (path) {
    case PATHS.bot:
    case PATHS.manifest:
    case PATHS.config:
    case PATHS.interests:
    case PATHS.formats:
    case PATHS.whatIMissedCursor:
      return true;
    default:
      break;
  }
  const feed = path.match(/^\/pub\/app\.pubchi\/v1\/feeds\/([^/]+)\.json$/);
  if (feed && FEED_ID.test(feed[1])) return true;
  const snap = path.match(/^\/pub\/app\.pubchi\/v1\/follower-snapshots\/([^/]+)\.json$/);
  if (snap && SNAPSHOT_ID.test(snap[1])) return true;
  const req = path.match(/^\/pub\/app\.pubchi\/v1\/requests\/([^/]+)\.json$/);
  if (req && REQUEST_ID.test(req[1])) return true;
  const sug = path.match(/^\/pub\/app\.pubchi\/v1\/suggestions\/([^/]+)\.json$/);
  if (sug && REQUEST_ID.test(sug[1])) return true;
  const run = path.match(/^\/pub\/app\.pubchi\/v1\/runs\/([^/]+)\.json$/);
  if (run && REQUEST_ID.test(run[1])) return true;
  const bind = path.match(/^\/pub\/app\.pubchi\/v1\/bots\/([^/]+)\.json$/);
  if (bind && REQUEST_ID.test(bind[1])) return true;
  const device = path.match(/^\/pub\/app\.pubchi\/v1\/devices\/([^/]+)\.json$/);
  if (device && REQUEST_ID.test(device[1])) return true;
  return false;
}

export const ALLOWLISTED_PATH_PATTERNS = [
  PATHS.bot,
  PATHS.manifest,
  PATHS.config,
  PATHS.interests,
  PATHS.formats,
  '/pub/app.pubchi/v1/feeds/<feed-id>.json',
  '/pub/app.pubchi/v1/follower-snapshots/<unix-seconds>.json',
  PATHS.whatIMissedCursor,
  '/pub/app.pubchi/v1/requests/<request-id>.json',
  '/pub/app.pubchi/v1/suggestions/<suggestion-id>.json',
  '/pub/app.pubchi/v1/runs/<run-id>.json',
  '/pub/app.pubchi/v1/bots/<bot>.json',
  '/pub/app.pubchi/v1/devices/<device>.json',
] as const;
