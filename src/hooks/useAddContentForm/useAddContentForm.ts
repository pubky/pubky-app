'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { parsePostReference } from '@/pipes/post/post.reference';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  ADD_CONTENT_FORM_FIELDS,
  type AddContentFormData,
  addContentFormDefaults,
  addContentFormSchema,
  type AddContentTarget,
} from './useAddContentForm.types';

interface UseAddContentFormOptions {
  target: AddContentTarget;
  onSuccess?: (postId: string) => Promise<void> | void;
}

interface UseAddContentFormResult {
  form: UseFormReturn<AddContentFormData>;
  submit: (value?: string) => Promise<boolean>;
  handlePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  reset: () => void;
  isPending: boolean;
}

export function useAddContentForm({ target, onSuccess }: UseAddContentFormOptions): UseAddContentFormResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<AddContentFormData>({
    resolver: zodResolver(addContentFormSchema),
    defaultValues: addContentFormDefaults,
    mode: 'onChange',
  });

  const setFieldError = (message: string) => {
    form.setError(ADD_CONTENT_FORM_FIELDS.POST_URL, {
      type: 'manual',
      message,
    });
  };

  const reset = () => {
    form.reset(addContentFormDefaults);
  };

  const submit = async (value?: string): Promise<boolean> => {
    if (isPending) return false;

    if (value !== undefined) {
      form.setValue(ADD_CONTENT_FORM_FIELDS.POST_URL, value, {
        shouldDirty: true,
        shouldValidate: false,
      });
    }

    const isValid = await form.trigger(ADD_CONTENT_FORM_FIELDS.POST_URL);
    if (!isValid) return false;

    const parsed = parsePostReference(form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL));
    if (!parsed) {
      setFieldError('Enter a valid post URL.');
      return false;
    }

    if (!currentUserPubky) {
      setFieldError('Could not add this post.');
      return false;
    }

    setIsPending(true);

    try {
      const post = await PostController.getOrFetch({
        compositeId: parsed.compositeId,
        viewerId: currentUserPubky,
      });

      if (!post || isPostDeleted(post.content)) {
        setFieldError('We could not find that post.');
        return false;
      }

      if (post.kind === 'collection') {
        setFieldError('Collection can not be added to a collection.');
        return false;
      }

      const alreadyAdded = await isAlreadyAdded({ target, postId: parsed.compositeId, postUri: parsed.postUri });
      if (alreadyAdded) {
        setFieldError('This post is already added.');
        return false;
      }

      if (target.type === 'bookmarks') {
        await BookmarkController.commitCreate({
          postId: parsed.compositeId,
          userId: currentUserPubky,
        });
      } else {
        await PostController.commitUpdateCollectionItem({
          collectionId: target.collectionId,
          postId: parsed.compositeId,
          shouldAdd: true,
        });
      }

      await onSuccess?.(parsed.compositeId);
      reset();
      return true;
    } catch (error) {
      Logger.error('[useAddContentForm] Failed to add content', {
        error,
        target,
        postId: parsed.compositeId,
      });
      setFieldError('Could not add this post.');
      return false;
    } finally {
      setIsPending(false);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    void submit(event.clipboardData.getData('text'));
  };

  return {
    form,
    submit,
    handlePaste,
    reset,
    isPending,
  };
}

async function isAlreadyAdded({
  target,
  postId,
  postUri,
}: {
  target: AddContentTarget;
  postId: string;
  postUri: string;
}): Promise<boolean> {
  if (target.type === 'bookmarks') {
    return await BookmarkController.exists(postId);
  }

  const collection = await PostController.getDetails({ compositeId: target.collectionId });
  const currentContent =
    collection && !isPostDeleted(collection.content) ? CollectionPostContent.parse(collection.content) : null;

  return Boolean(currentContent?.items?.includes(postUri));
}
