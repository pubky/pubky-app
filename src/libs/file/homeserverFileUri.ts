import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';

/**
 * Returns true when `uri` is a homeserver file resource
 * (`pubky://<user>/pub/pubky.app/files/<fileId>`) that can be deleted via
 * `FileApplication.commitDelete`.
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
