'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted, readFromClipboard } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/use-toast';
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
  pasteFromClipboard: () => Promise<void>;
  reset: () => void;
  isPending: boolean;
}

const MAX_POST_URL_LENGTH = 2048;

export function useAddContentForm({ target, onSuccess }: UseAddContentFormOptions): UseAddContentFormResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [isPending, setIsPending] = useState(false);
  // Refs, not state: reentrancy guards must flip synchronously — the isPending state a render closure
  // captures stays false until the re-render, letting rapid double-clicks start two submit pipelines.
  const submitPendingRef = useRef(false);
  const readingClipboardRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    if (submitPendingRef.current) return false;
    submitPendingRef.current = true;

    try {
      if (value !== undefined) {
        if (value.length > MAX_POST_URL_LENGTH) {
          setFieldError('Enter a valid post URL.');
          return false;
        }

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

        // The awaits above give the user time to dismiss the dialog; never commit after it closed.
        if (!mountedRef.current) return false;

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
    } finally {
      submitPendingRef.current = false;
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    void submit(event.clipboardData.getData('text'));
  };

  const pasteFromClipboard = async () => {
    if (readingClipboardRef.current || submitPendingRef.current) return;
    readingClipboardRef.current = true;

    const valueBeforeRead = form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL);

    let text: string;
    try {
      text = await readFromClipboard();
    } catch (error) {
      Logger.error('[useAddContentForm] Failed to read clipboard', { error });
      toast({ variant: 'error', description: await clipboardReadErrorDescription() });
      return;
    } finally {
      readingClipboardRef.current = false;
    }

    // The read can stall on a browser permission prompt: never act on a closed dialog,
    // and never clobber text the user typed while waiting.
    if (!mountedRef.current || form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL) !== valueBeforeRead) return;

    await submit(text);
  };

  return {
    form,
    submit,
    handlePaste,
    pasteFromClipboard,
    reset,
    isPending,
  };
}

/**
 * A denied clipboard-read permission is sticky in Chromium — the browser never re-prompts, so the
 * user must reset it themselves. Detect that state to explain the way out instead of a dead-end error.
 */
async function clipboardReadErrorDescription(): Promise<string> {
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    if (status.state === 'denied') {
      return "Clipboard access is blocked. Allow it in your browser's site settings, or paste manually.";
    }
  } catch {
    // Permissions API absent or 'clipboard-read' unsupported (Firefox/Safari) — use the generic message.
  }

  return 'Could not read clipboard.';
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
