'use client';

import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import { useCoverImagePicker, type UseCoverImagePickerResult } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import {
  CREATE_COLLECTION_FORM_FIELDS,
  type CreateCollectionFormData,
  createCollectionFormDefaults,
  createCollectionFormSchema,
} from '@/hooks/useCreateCollection/useCreateCollection.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isAppError } from '@/libs/error/error.utils';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { resolveCollectionCoverImage } from '@/libs/post/collectionCoverImage';
import { toast } from '@/molecules/Toaster/toast';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { UseEditCollectionParams } from './useEditCollection.types';

type UseEditCollectionResult = {
  /** React Hook Form instance — same shape as `useCreateCollection.form`. */
  form: UseFormReturn<CreateCollectionFormData>;
  /** Cover image picker, pre-seeded with the current cover (resolved to a CDN URL). */
  cover: UseCoverImagePickerResult;
  /** `true` until the collection envelope loads and the form is prefilled. */
  isLoaded: boolean;
  /**
   * Validate + commit the edit. Resolves `true` on success, `false` otherwise
   * (validation failed, the collection no longer loads, or the controller threw).
   */
  submit: () => Promise<boolean>;
  /** Reset the form to the loaded collection values and clear the picker. */
  reset: () => void;
};

/**
 * "Edit collection" form hook. Mirrors `useCreateCollection`'s shape so the
 * shared dialog shell can render either flow.
 *
 * The form fields and validation schema are reused from `useCreateCollection`
 * because the rules are identical (name required + length limits). Mode-specific
 * strings come from `collections.edit`; shared form labels/validation messages
 * stay in `collections.new`.
 */
export function useEditCollection({ compositeCollectionId }: UseEditCollectionParams): UseEditCollectionResult {
  const { postDetails } = usePostDetails(compositeCollectionId);
  const collection = postDetails ? parseCollectionContent(postDetails.content) : null;

  const originalName = collection?.name ?? '';
  const originalDescription = collection?.description ?? '';
  const originalLayout = collection?.layout ?? DEFAULT_COLLECTION_LAYOUT;
  // Preserve the raw envelope value so we can pass it back unchanged when the
  // user leaves the cover alone (avoids re-uploading and avoids storing the
  // CDN-resolved URL back into the envelope).
  const originalCoverImage = collection?.cover_image ?? null;
  // Prefer a recently-uploaded blob URL stashed in the local-files store. After
  // an edit that uploaded a new cover, the envelope already references the new
  // `pubky://` URL but the CDN may not have indexed it yet — without this, the
  // picker would render an empty preview when the dialog is re-opened.
  const localCoverUrl = useLocalFilesStore((s) => s.collections[compositeCollectionId]);
  const initialPreviewUrl = localCoverUrl ?? resolveCollectionCoverImage(originalCoverImage, FileVariant.MAIN);

  const cover = useCoverImagePicker({ initialPreviewUrl });

  const form = useForm<CreateCollectionFormData>({
    resolver: zodResolver(createCollectionFormSchema),
    defaultValues: createCollectionFormDefaults,
    // See useCreateCollection for the rationale — `onChange` (not `all`) keeps
    // blur from firing validation, so closing the dialog doesn't risk a
    // layout-shift-driven misclick on the X button.
    mode: 'onChange',
  });

  // Prefill the form once the collection envelope arrives. The guard uses
  // `originalName` (not `collection`) so the deps array only contains the
  // primitives the effect actually reads. `originalName` is non-empty iff the
  // envelope parsed successfully — `CollectionPostContent.normalize` throws on
  // empty names and `parse` catches that into `null` — so this guard matches
  // the `collection !== null` check exactly while keeping the deps stable
  // across the RHF-induced re-render that `form.reset()` itself schedules.
  const hasPrefilledRef = useRef(false);
  useEffect(() => {
    if (hasPrefilledRef.current) return;
    if (!originalName) return;
    form.reset({
      [CREATE_COLLECTION_FORM_FIELDS.NAME]: originalName,
      [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: originalDescription,
      [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: originalLayout,
    });
    hasPrefilledRef.current = true;
  }, [form, originalDescription, originalLayout, originalName]);

  // Latest envelope values, readable imperatively from `reset()`. The dialog's
  // close handler captures `reset` in the render where Save was clicked, so
  // reading the render-scope primitives there would restore the PRE-save
  // values: the local-first commit propagates the committed envelope through
  // the Dexie live query while the save is still awaited — i.e. before
  // `reset()` runs — and the prefill effect above never re-fires afterwards
  // because its deps already changed while `hasPrefilledRef` was still armed.
  const originalsRef = useRef({ name: originalName, description: originalDescription, layout: originalLayout });
  useEffect(() => {
    originalsRef.current = { name: originalName, description: originalDescription, layout: originalLayout };
  }, [originalDescription, originalLayout, originalName]);

  const submit = async (): Promise<boolean> => {
    if (!collection) return false;

    let ok = false;
    await form.handleSubmit(async (data) => {
      const name = data[CREATE_COLLECTION_FORM_FIELDS.NAME];
      const description = data[CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION];
      const layout = data[CREATE_COLLECTION_FORM_FIELDS.LAYOUT];

      // Resolve the cover argument: new file > cleared > unchanged.
      let coverArg: File | string | null;
      if (cover.file) {
        coverArg = cover.file;
      } else if (cover.isCleared) {
        coverArg = null;
      } else {
        coverArg = originalCoverImage;
      }

      try {
        await PostController.commitEditCollection({
          compositeCollectionId,
          name,
          description,
          coverImage: coverArg,
          layout,
        });

        // Mirror the post-attachment / avatar pattern: stash a blob URL in the
        // local-files store so the cover renders instantly while the homeserver
        // / CDN catch up. Only do this when the cover actually changed.
        if (cover.file) {
          const blobUrl = URL.createObjectURL(cover.file);
          useLocalFilesStore.getState().setCollectionCover(compositeCollectionId, blobUrl);
        } else if (cover.isCleared) {
          useLocalFilesStore.getState().setCollectionCover(compositeCollectionId, null);
        }

        toast({
          title: 'Collection updated',
        });
        ok = true;
      } catch (error) {
        Logger.error('[useEditCollection] Failed to edit collection', { error });
        toast({
          variant: 'error',
          description:
            getImageUploadSizeLimitToastMessage(error) ??
            (isAppError(error) ? error.message : 'Failed to update collection.'),
        });
      }
    })();
    return ok;
  };

  const reset = () => {
    // Read through `originalsRef` (not the render closure) so a dialog closed
    // right after a save resets to the values the user just committed.
    form.reset({
      [CREATE_COLLECTION_FORM_FIELDS.NAME]: originalsRef.current.name,
      [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: originalsRef.current.description,
      [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: originalsRef.current.layout,
    });
    cover.reset();
    // Covers the opposite ordering: if the Dexie live query has NOT propagated
    // yet, the values above are still the pre-save ones. Clearing the ref lets
    // the prefill effect catch up once the fresh envelope arrives — so a
    // reopened dialog shows the committed values rather than the pre-save ones.
    hasPrefilledRef.current = false;
  };

  return {
    form,
    cover,
    isLoaded: !!collection,
    submit,
    reset,
  };
}
