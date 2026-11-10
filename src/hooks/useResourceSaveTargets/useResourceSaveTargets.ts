'use client';

import { PostController } from '@/controllers/post/post';
import { useCollectionSaveTargets } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets';
import type { UseCollectionSaveTargetsResult } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets.types';

type UseResourceSaveTargetsOptions = {
  /** Whether the picker is open: it loads more collections only while open. */
  isPickerOpen: boolean;
};

/**
 * The viewer's own collections as save targets for an external resource (a link of any scheme):
 * which of them hold the link, adding it to one or taking it out, and "New collection" with the link
 * in it.
 * The resource counterpart of `usePostSaveTargets`, without a bookmark (the card has its own).
 *
 * @param uri - The link exactly as written: the collection item's `uri`
 */
export function useResourceSaveTargets(
  uri: string,
  { isPickerOpen }: UseResourceSaveTargetsOptions,
): UseCollectionSaveTargetsResult {
  return useCollectionSaveTargets({
    itemUris: [uri],
    isPickerOpen,
    commitToggle: (collectionId, shouldAdd) =>
      PostController.commitUpdateCollectionResource({ collectionId, uri, shouldAdd }),
    messages: {
      added: 'Link added to collection.',
      removed: 'Link removed from collection.',
      created: 'Collection created and link saved.',
    },
    logContext: { source: 'useResourceSaveTargets', ids: {} },
  });
}
