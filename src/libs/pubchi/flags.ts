import type { Phase0Purpose } from '@/libs/pubchi/schemas/request';
import { getPubchiApiUrl, getPubchiEnabled } from '@/libs/runtime-config/runtime-config';

/** Paths the Phase 0 service actually serves. */
export type PubchiPhase0Endpoint = '/v1/query' | '/v1/feed';

/** True when the deployer turned the Pubchi flag on. */
export function isPubchiEnabled(): boolean {
  return getPubchiEnabled();
}

/**
 * Chat panel is shown only when the flag is on and an API URL is configured.
 * An empty URL hides the panel even if the flag is true.
 */
export function isPubchiPanelEnabled(): boolean {
  return isPubchiEnabled() && getPubchiApiUrl().trim() !== '';
}

/**
 * Phase 0 HTTP path for a purpose. `who-tagged-me` is POST /v1/query;
 * `build-feed` is POST /v1/feed. Other PHASE0_PURPOSES are not served —
 * the App must refuse them instead of sending a request that will 400.
 */
export function pubchiEndpointFor(purpose: Phase0Purpose): PubchiPhase0Endpoint | undefined {
  switch (purpose) {
    case 'ask':
    case 'who-tagged-me':
      return '/v1/query';
    case 'build-feed':
      return '/v1/feed';
    default:
      return undefined;
  }
}

export function getPubchiUrlFor(purpose: Phase0Purpose): string | undefined {
  const path = pubchiEndpointFor(purpose);
  if (!path) return undefined;
  return `${pubchiApiBase()}${path}`;
}

export function getPubchiQueryUrl(): string {
  return `${pubchiApiBase()}/v1/query`;
}

function pubchiApiBase(): string {
  return getPubchiApiUrl().replace(/\/+$/, '');
}
