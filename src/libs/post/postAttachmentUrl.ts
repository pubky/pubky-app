import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { filesApi } from '@/services/nexus/file/file.api';
import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Resolves a post attachment reference into an absolute CDN URL. Only
 * `pubky://<user>/pub/pubky.app/files/<fileId>` URIs are accepted — they resolve
 * to our own CDN. Anything else (including absolute `http(s)` URLs) is rejected,
 * so a server-side consumer can never be pointed at an arbitrary/internal host
 * (SSRF). In practice every post attachment is a homeserver file URI, so this
 * reflects reality rather than restricting it.
 *
 * Uses only pure primitives (avoids the Dexie-tainted `FileController.getFileUrl`),
 * so it runs in a Server Component as well as in the app. Returns `null` on any
 * empty / non-pubky / malformed input so the caller can fall back gracefully.
 */
export function resolvePostAttachmentUrl(
  attachmentUri: string | null | undefined,
  variant: FileVariant = FileVariant.FEED,
): string | null {
  const trimmed = attachmentUri?.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('pubky://')) {
    Logger.warn('[postAttachmentUrl] Rejected non-pubky attachment (only CDN file URIs are used)', { uri: trimmed });
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
    Logger.warn('[postAttachmentUrl] Failed to resolve attachment pubky URI', { uri: trimmed, error });
    return null;
  }
}
