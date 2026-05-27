'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { PostController } from '@/controllers/post/post';
import { useCoverImagePicker, type UseCoverImagePickerResult } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  CREATE_COLLECTION_FORM_FIELDS,
  type CreateCollectionFormData,
  createCollectionFormDefaults,
  createCollectionFormSchema,
} from './useCreateCollection.types';

type UseCreateCollectionResult = {
  /** React Hook Form instance — wire to `ControlledInputField` via `form.control`. */
  form: UseFormReturn<CreateCollectionFormData>;
  /** Cover image picker — file/preview/error state plus handlers. */
  cover: UseCoverImagePickerResult;
  /**
   * Validate + commit the collection. Returns `true` on success, `false`
   * otherwise (validation rejected the form, or the controller threw). Uses
   * RHF's `handleSubmit` so field-level errors surface in the UI.
   */
  submit: () => Promise<boolean>;
  /** Clear the form fields and the cover picker. */
  reset: () => void;
};

/**
 * Encapsulates the "create collection" form on top of react-hook-form + zod.
 *
 * - Schema lives in `./useCreateCollection.types.ts`
 * - Cover image is managed by `useCoverImagePicker` (separate concern: file
 *   pickers don't fit RHF's `register`/`Controller` model cleanly because of
 *   blob URL lifecycle and image-specific validation)
 * - Validation mode is `all`: required feedback appears after blur and clears
 *   as the user edits a valid value.
 * - `submit()` returns `Promise<boolean>` so the caller can decide what to do
 *   on success (close dialog, navigate, etc.)
 */
export function useCreateCollection(): UseCreateCollectionResult {
  const t = useTranslations('collections.new');
  const tToast = useTranslations('toast');
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { toast } = useToast();
  const cover = useCoverImagePicker();

  const form = useForm<CreateCollectionFormData>({
    resolver: zodResolver(createCollectionFormSchema(t)),
    defaultValues: createCollectionFormDefaults,
    mode: 'all',
  });

  const submit = async (): Promise<boolean> => {
    if (!currentUserPubky) return false;

    let succeeded = false;
    await form.handleSubmit(async (data) => {
      const name = data[CREATE_COLLECTION_FORM_FIELDS.NAME];
      const description = data[CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION];
      try {
        await PostController.commitCreateCollection({
          authorId: currentUserPubky,
          name,
          description,
          coverImage: cover.file,
        });
        toast({
          title: tToast('success'),
          description: t('created', { name: name.trim() }),
        });
        succeeded = true;
      } catch (error) {
        Logger.error('[useCreateCollection] Failed to create collection', { error });
        toast({
          title: tToast('error'),
          description: t('createFailed'),
        });
      }
    })();
    return succeeded;
  };

  const reset = () => {
    form.reset(createCollectionFormDefaults);
    cover.reset();
  };

  return {
    form,
    cover,
    submit,
    reset,
  };
}
