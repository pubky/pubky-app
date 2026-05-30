import { MARKER_TTL_MS, VIEWER_TAG_MARKER_STORAGE_PREFIX } from '@/config/viewerTagMarker';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';

/** PUT = viewer created the tag, DELETE = viewer removed it. */
type ViewerTagMarkerOp = HttpMethod.PUT | HttpMethod.DELETE;

interface ViewerTagMarker {
  op: ViewerTagMarkerOp;
  ts: number;
  expiresAt: number;
}

function buildKey(pubky: Pubky, postId: string, label: string): string {
  return `${VIEWER_TAG_MARKER_STORAGE_PREFIX}${pubky}:${postId}:${label.toLowerCase()}`;
}

function userPrefix(pubky: Pubky): string {
  return `${VIEWER_TAG_MARKER_STORAGE_PREFIX}${pubky}:`;
}

// Parses + structurally validates a marker. Returns null for anything that
// isn't a recognizable marker (bad JSON, wrong shape, unknown `op`, etc.).
function parseMarker(raw: string): ViewerTagMarker | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as { op?: unknown; ts?: unknown; expiresAt?: unknown };

  if (candidate.op !== HttpMethod.PUT && candidate.op !== HttpMethod.DELETE) return null;
  if (typeof candidate.ts !== 'number') return null;
  if (typeof candidate.expiresAt !== 'number') return null;

  return { op: candidate.op, ts: candidate.ts, expiresAt: candidate.expiresAt };
}

// Reads one marker, validates it, and lazy-deletes the entry if it's invalid
// (corrupted/unknown op/missing fields) or expired. Returns null in those cases.
function readMarkerOrNull(key: string, now: number): ViewerTagMarker | null {
  const raw = window.sessionStorage.getItem(key);
  if (raw === null) return null;

  const marker = parseMarker(raw);
  if (!marker || marker.expiresAt <= now) {
    window.sessionStorage.removeItem(key);
    return null;
  }
  return marker;
}

// Iterates sessionStorage keys and removes the ones that match `predicate`.
// Collects matching keys first so removals don't shift indices mid-iteration.
function removeKeysMatching(predicate: (key: string) => boolean): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i);
    if (key !== null && predicate(key)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    window.sessionStorage.removeItem(key);
  }
}

export class ViewerTagMarkerStorage {
  private constructor() {}

  static set({
    pubky,
    postId,
    label,
    op,
  }: {
    pubky: Pubky;
    postId: string;
    label: string;
    op: ViewerTagMarkerOp;
  }): void {
    const ts = Date.now();
    const marker: ViewerTagMarker = { op, ts, expiresAt: ts + MARKER_TTL_MS };

    try {
      window.sessionStorage.setItem(buildKey(pubky, postId, label), JSON.stringify(marker));
    } catch {
      // setItem can throw QuotaExceededError; markers are best-effort, so swallow.
    }
  }

  static get({ pubky, postId, label }: { pubky: Pubky; postId: string; label: string }): ViewerTagMarker | null {
    return readMarkerOrNull(buildKey(pubky, postId, label), Date.now());
  }

  /**
   * Removes all expired or invalid marker entries across sessionStorage.
   * Called from mergeTags so stale markers don't accumulate.
   */
  static sweepExpired(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key === null || !key.startsWith(VIEWER_TAG_MARKER_STORAGE_PREFIX)) continue;

      const raw = window.sessionStorage.getItem(key);
      if (raw === null) continue;

      const marker = parseMarker(raw);
      if (!marker || marker.expiresAt <= now) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  }

  static clearForUser(pubky: Pubky): void {
    const prefix = userPrefix(pubky);
    removeKeysMatching((key) => key.startsWith(prefix));
  }
}
