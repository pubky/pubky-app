import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { parsePubchiDocumentText, validatePubchiDocumentSize } from '@/libs/pubchi/schemas/document';
import { type FeedProposalV1, type FeedProposalV2, pubchiFeedIdSchema } from '@/libs/pubchi/schemas/feed';
import { parsePubchiFeedProvenanceV1, type PubchiFeedProvenanceV1 } from '@/libs/pubchi/schemas/feed-provenance';
import { feedSyncLock } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
import { withSyncLock } from '@/utils/sync-lock';

async function requestPubchiDocumentText(url: string): Promise<string> {
  if (typeof HomeserverService.requestRawText === 'function') {
    return HomeserverService.requestRawText(url);
  }
  return JSON.stringify(await HomeserverService.request<unknown>({ method: HttpMethod.GET, url }));
}

/** Missing (null) may be created. Invalid (false) must never be overwritten or removed. */
async function readProvenance(url: string): Promise<PubchiFeedProvenanceV1 | null | false> {
  try {
    const parsed = parsePubchiDocumentText(await requestPubchiDocumentText(url), parsePubchiFeedProvenanceV1);
    if (parsed.ok) return parsed.value;
    if (parsed.code === 'SCHEMA_INVALID') return false;
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, parsed.code, {
      service: ErrorService.Pubchi,
      operation: 'recordPubchiBuiltFeed',
    });
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
    throw error;
  }
}

export async function recordPubchiBuiltFeed(
  owner: string,
  proposal: FeedProposalV1 | FeedProposalV2,
  feed: FeedModelSchema,
  previousFeedId = feed.id,
): Promise<boolean> {
  const url = provenanceUri(owner, feed.id);
  const previousUrl = previousFeedId === feed.id ? null : provenanceUri(owner, previousFeedId);
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return withSyncLock(feedSyncLock(owner), 'exclusive', async () => {
    const proposalHash = await sha256Hex(canonicalJson(proposal));
    const written = await retryHomeserverWriteAfterReread(fence, async () => {
      const existing = await readProvenance(url);
      const previous = previousUrl ? await readProvenance(previousUrl) : null;
      if (existing === false || (existing && existing.feed_id !== feed.id)) return false;
      // Older App versions could write the new feed ID into the record at the old address.
      if (previous === false || (previous && previous.feed_id !== previousFeedId && previous.feed_id !== feed.id)) {
        return false;
      }
      const now = Math.floor(Date.now() / 1000);
      const record = {
        ...previous,
        ...existing,
        ...(previous?.ext && existing?.ext ? { ext: { ...previous.ext, ...existing.ext } } : {}),
        schema: 'pubchi-feed-provenance',
        version: 1,
        feed_id: feed.id,
        created_at: existing?.created_at ?? previous?.created_at ?? now,
        ...(existing || previous ? { updated_at: now } : {}),
        proposal_hash: proposalHash,
        bot: proposal.bot,
      };
      const parsed = parsePubchiFeedProvenanceV1(record);
      const checked = parsed.ok ? validatePubchiDocumentSize(record) : parsed;
      if (!checked.ok) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, checked.code, {
          service: ErrorService.Pubchi,
          operation: 'recordPubchiBuiltFeed',
        });
      }
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: record, fence });
      return { previous };
    });
    if (!written) return false;
    if (!previousUrl || !written.previous) return true;

    // Only remove the source we copied. A retry or another device can change it after our PUT.
    const copied = canonicalJson(written.previous);
    return retryHomeserverWriteAfterReread(fence, async () => {
      const current = await readProvenance(previousUrl);
      if (current === null) return true;
      if (current === false || canonicalJson(current) !== copied) return false;
      try {
        await HomeserverService.request({ method: HttpMethod.DELETE, url: previousUrl, fence });
      } catch (error) {
        if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
      }
      return true;
    });
  });
}

/** The feed delete already holds the same owner lock as a provenance write. */
export async function deletePubchiFeedProvenance(owner: string, feedId: string): Promise<void> {
  await HomeserverService.deleteIdempotent(provenanceUri(owner, feedId));
}

export async function listPubchiFeedProvenance(owner: string): Promise<PubchiFeedProvenanceV1[]> {
  const files = await HomeserverService.listAll({ baseDirectory: provenanceDirectory(owner) });
  const results = await Promise.allSettled(
    files.map(async (url) => {
      const match = url.match(/\/app\.pubchi\/v1\/feeds\/([^/]+)\.json$/);
      if (!match) return undefined;
      const parsed = parsePubchiDocumentText(await requestPubchiDocumentText(url), parsePubchiFeedProvenanceV1);
      if (!parsed.ok || parsed.value.feed_id !== match[1]) return undefined;
      return parsed.value;
    }),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
}

export function provenanceUri(owner: string, feedId: string): string {
  if (!pubchiFeedIdSchema.safeParse(feedId).success) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid Pubchi feed id', {
      service: ErrorService.Pubchi,
      operation: 'provenanceUri',
    });
  }
  return `${provenanceDirectory(owner)}${feedId}.json`;
}

export function provenanceDirectory(owner: string): string {
  return `pubky://${owner}/priv/app.pubchi/v1/feeds/`;
}
