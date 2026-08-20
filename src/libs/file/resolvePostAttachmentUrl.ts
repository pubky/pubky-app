import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { filesApi } from '@/services/nexus/file/file.api';
import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Resolves a post attachment into an absolute CDN URL.
 * Only `pubky://<user>/pub/pubky.app/files/<fileId>` URIs are accepted — they
 * resolve to our own CDN. Anything else (including absolute `http(s)` URLs) is
 * rejected so callers that fetch the result cannot be pointed at an arbitrary
 * host (SSRF). In practice every post attachment is a homeserver file URI.
 *
 * Uses only pure primitives (avoids the Dexie-tainted `FileController.getFileUrl`).
 * Returns `null` on any empty / non-pubky / malformed input.
 */
export function resolvePostAttachmentUrl(
  attachmentUri: string | null | undefined,
  variant: FileVariant = FileVariant.FEED,
): string | null {
  const trimmed = attachmentUri?.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('pubky://')) {
    Logger.warn('[resolvePostAttachmentUrl] Rejected non-pubky attachment (only CDN file URIs are used)', {
      uri: trimmed,
    });
    return null;
  }

  try {
    const compositeId = buildCompositeIdFromPubkyUri({
      uri: trimmed as Pubky,
      domain: CompositeIdDomain.FILES,
    });
    if (!compositeId) return null;
    const { pubky, id } = parseCompositeId(compositeId);
    return filesApi.getFileUrl({ pubky, file_id: id, variant });
  } catch (error) {
    Logger.warn('[resolvePostAttachmentUrl] Failed to resolve attachment pubky URI', { uri: trimmed, error });
    return null;
  }
}
