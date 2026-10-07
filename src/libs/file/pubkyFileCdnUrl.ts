import { FileController } from '@/controllers/file/file';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import type { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Resolves a homeserver `pubky://<user>/pub/pubky.app/files/<fileId>` URI to
 * its Nexus static CDN URL for the requested variant. Returns `null` for
 * anything that is not a well-formed homeserver file URI, so the caller can
 * fall back instead of firing a request the browser cannot load
 * (`pubky://` has no native handler — `net::ERR_UNKNOWN_URL_SCHEME`).
 *
 * Pure URL construction: no metadata fetch, no IO.
 *
 * Lives in `src/libs/file/` (not the pipes/application layers) because it
 * depends on `FileController`; only UI-layer modules may import it (see
 * AGENTS.md layering).
 */
export function pubkyUriToCdnUrl(uri: string | null | undefined, variant: FileVariant): string | null {
  const trimmed = uri?.trim();
  if (!trimmed?.startsWith('pubky://')) return null;

  try {
    const compositeId = buildCompositeIdFromPubkyUri({
      uri: trimmed as Pubky,
      domain: CompositeIdDomain.FILES,
    });
    if (!compositeId) return null;
    return FileController.getFileUrl({ fileId: compositeId, variant });
  } catch (error) {
    Logger.warn('[pubkyFileCdnUrl] Failed to resolve pubky file URI', { uri: trimmed, error });
    return null;
  }
}
