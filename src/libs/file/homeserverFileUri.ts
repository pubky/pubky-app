import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';

/**
 * Returns true when `uri` is a homeserver file resource, v1 media
 * (`pubky://<user>/pub/social/v1/files/<hash>.<ext>`) or a 0.x file
 * (`pubky://<user>/pub/pubky.app/files/<fileId>`), that `FileApplication.commitDelete`
 * takes (it deletes v1 media only and leaves a 0.x file alone).
 */
export function isHomeserverFileUri(uri: string | null | undefined): uri is string {
  const trimmed = uri?.trim();
  if (!trimmed?.startsWith('pubky://')) return false;

  try {
    return (
      buildCompositeIdFromPubkyUri({
        uri: trimmed as Pubky,
        domain: CompositeIdDomain.FILES,
      }) !== null
    );
  } catch {
    return false;
  }
}
