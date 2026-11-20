'use client';

import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';

/**
 * The file a pubky.app file URI names (a 0.x `files/<id>`, or v1 media), read as a post's attachments
 * are (`useAttachmentsMetadata`: the local table, else Nexus): `null` once the read settled without
 * it (Nexus does not know it, or could not be read). One URI is asked, so its row is the one answered,
 * whatever spelling of the URI it was tagged under.
 */
export function usePubkyAppFile(uri: string): { file: NexusFileDetails | null; isLoading: boolean } {
  const { files, isLoading } = useAttachmentsMetadata({ fileUris: [uri] });
  return { file: files[0] ?? null, isLoading };
}
