'use client';

import { PostController } from '@/controllers/post/post';
import { useCollectionSaveTargets } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets';
import type { UseCollectionSaveTargetsResult } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets.types';

type UseResourceSaveTargetsOptions = {
  /** Whether the picker is open: it loads more collections only while open. */
  isPickerOpen: boolean;
  /** Other spellings of the link (`getResourceTarget`): a collection holding one holds the link. */
  spellings?: readonly string[];
};

/**
 * The viewer's own collections as save targets for an external resource (a link of any scheme):
 * which of them hold the link, adding it to one or taking it out, and "New collection" with the link
 * in it.
 * The resource counterpart of `usePostSaveTargets`, without a bookmark (the card has its own).
 *
 * @param uri - The link exactly as written, or the card's canonical link: the collection item's `uri`
 */
export function useResourceSaveTargets(
  uri: string,
  { isPickerOpen, spellings = [] }: UseResourceSaveTargetsOptions,
): UseCollectionSaveTargetsResult {
  return useCollectionSaveTargets({
    // A new item is `uri`; taking it out removes every spelling.
    itemUris: [uri, ...spellings],
    isPickerOpen,
    commitToggle: (collectionId, shouldAdd) =>
      PostController.commitUpdateCollectionResource({
        collectionId,
        uri,
        shouldAdd,
        ...(spellings.length > 0 ? { spellings } : {}),
      }),
    messages: {
      added: 'Link added to collection.',
      removed: 'Link removed from collection.',
      created: 'Collection created and link saved.',
    },
    logContext: { source: 'useResourceSaveTargets', ids: {} },
  });
}
