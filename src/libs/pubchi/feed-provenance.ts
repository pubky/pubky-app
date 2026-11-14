import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { parsePubchiDocumentText, validatePubchiDocumentSize } from '@/libs/pubchi/schemas/document';
import type { FeedProposalV1, FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import {
  parsePubchiFeedProvenanceV1,
  type PubchiFeedProvenanceV1,
  PubchiFeedProvenanceV1Schema,
} from '@/libs/pubchi/schemas/feed-provenance';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';

async function requestPubchiDocumentText(url: string): Promise<string> {
  if (typeof HomeserverService.requestRawText === 'function') {
    return HomeserverService.requestRawText(url);
  }
  return JSON.stringify(await HomeserverService.request<unknown>({ method: HttpMethod.GET, url }));
}

export async function recordPubchiBuiltFeed(
  owner: string,
  proposal: FeedProposalV1 | FeedProposalV2,
  feed: FeedModelSchema,
  provenanceFeedId = feed.id,
): Promise<boolean> {
  const url = provenanceUri(owner, provenanceFeedId);
  const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
  return retryHomeserverWriteAfterReread(fence, async () => {
    let existing: (PubchiFeedProvenanceV1 & Record<string, unknown>) | undefined;
    try {
      let rawExisting: unknown;
      const parsedExisting = parsePubchiDocumentText(await requestPubchiDocumentText(url), (value) => {
        rawExisting = value;
        return parsePubchiFeedProvenanceV1(value);
      });
      if (parsedExisting.ok) {
        existing = parsedExisting.value as PubchiFeedProvenanceV1 & Record<string, unknown>;
      } else {
        if (parsedExisting.code !== 'SCHEMA_INVALID') {
          throw Err.validation(ValidationErrorCode.INVALID_INPUT, parsedExisting.code, {
            service: ErrorService.Pubchi,
            operation: 'recordPubchiBuiltFeed',
          });
        }
        const lenientExisting = PubchiFeedProvenanceV1Schema.passthrough().safeParse(rawExisting);
        if (!lenientExisting.success) {
          return false;
        }
        existing = lenientExisting.data;
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return false;
      }
      if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
        throw error;
      }
    }
    const record: PubchiFeedProvenanceV1 & Record<string, unknown> = {
      ...existing,
      schema: 'pubchi-feed-provenance',
      version: 1,
      feed_id: feed.id,
      created_at: Math.floor(Date.now() / 1000),
      ...(existing ? { created_at: existing.created_at, updated_at: Math.floor(Date.now() / 1000) } : {}),
      proposal_hash: await sha256Hex(canonicalJson(proposal)),
      bot: proposal.bot,
    };
    const parsed = parsePubchiFeedProvenanceV1({
      schema: record.schema,
      version: record.version,
      feed_id: record.feed_id,
      created_at: record.created_at,
      ...(record.updated_at !== undefined ? { updated_at: record.updated_at } : {}),
      proposal_hash: record.proposal_hash,
      bot: record.bot,
    });
    if (!parsed.ok) {
      throw Err.validation(ValidationErrorCode.TYPE_ERROR, parsed.code, {
        service: ErrorService.Pubchi,
        operation: 'recordPubchiBuiltFeed',
      });
    }
    const size = validatePubchiDocumentSize(record);
    if (!size.ok) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, size.code, {
        service: ErrorService.Pubchi,
        operation: 'recordPubchiBuiltFeed',
      });
    }
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url,
      bodyJson: record,
      fence,
    });
    return true;
  });
}

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
  return `pubky://${owner}/priv/app.pubchi/v1/feeds/${feedId}.json`;
}

export function provenanceDirectory(owner: string): string {
  return `pubky://${owner}/priv/app.pubchi/v1/feeds/`;
}
