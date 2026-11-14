'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { PostController } from '@/controllers/post/post';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { invalidateResourceBookmarks } from '@/hooks/useResourceBookmarks/useResourceBookmarks';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted, readFromClipboard } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { getResourceTarget } from '@/molecules/ResourceCard/ResourceCard.utils';
import { toast } from '@/molecules/Toaster/toast';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  ADD_CONTENT_FORM_FIELDS,
  type AddContentFormData,
  addContentFormDefaults,
  addContentFormSchema,
  type AddContentTarget,
} from './useAddContentForm.types';
import { parseAddContentInput } from './useAddContentForm.utils';

interface UseAddContentFormOptions {
  target: AddContentTarget;
  /** After an item was added: `postId` is the added post's, absent for a link. */
  onSuccess?: (postId?: string) => Promise<void> | void;
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
  const { waitForAuth } = useRequireAuth();
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
          setFieldError('Enter a valid URL.');
          return false;
        }

        form.setValue(ADD_CONTENT_FORM_FIELDS.POST_URL, value, {
          shouldDirty: true,
          shouldValidate: false,
        });
      }

      const isValid = await form.trigger(ADD_CONTENT_FORM_FIELDS.POST_URL);
      if (!isValid) return false;

      const parsed = parseAddContentInput(form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL));
      if (parsed.type === 'invalid') {
        setFieldError(parsed.message);
        return false;
      }

      if (!currentUserPubky) {
        setFieldError(parsed.type === 'link' ? 'Could not add this link.' : 'Could not add this post.');
        return false;
      }

      setIsPending(true);

      if (parsed.type === 'link') {
        try {
          return await addLink(parsed.uri, currentUserPubky);
        } catch (error) {
          Logger.error('[useAddContentForm] Failed to add link', { error, target, uri: parsed.uri });
          setFieldError('Could not add this link.');
          return false;
        } finally {
          setIsPending(false);
        }
      }

      try {
        const post = await PostController.getOrFetch({
          compositeId: parsed.compositeId,
          viewerId: currentUserPubky,
        });

        if (!post || isPostDeleted(post)) {
          setFieldError('We could not find that post.');
          return false;
        }

        if (post.kind === 'collection') {
          setFieldError('Collection can not be added to a collection.');
          return false;
        }

        const alreadyAdded = await isAlreadyAdded({ target, postId: parsed.compositeId });
        if (alreadyAdded) {
          setFieldError('This post is already added.');
          return false;
        }

        // The awaits above give the user time to dismiss the dialog; never commit after it closed.
        if (!mountedRef.current || !(await waitForAuth())) return false;

        if (target.type === 'bookmarks') {
          const saved = await BookmarkController.commitCreate({
            postId: parsed.compositeId,
            userId: currentUserPubky,
          });
          // false: the account changed while the write waited for the sync lock or ran; nothing to announce.
          if (!saved) return false;
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

  /**
   * Adds a link the way a card's save picker does (`useResourceSaveTargets`, `useResourceBookmark`):
   * on the card's canonical link when Pinakes knows it (`getResourceTarget`), else as written; a
   * collection or bookmark already holding any spelling of it holds the link.
   */
  const addLink = async (written: string, userId: Pubky): Promise<boolean> => {
    // Pinakes failing or not configured is no card: the link as written.
    const card = await PinakesController.fetchCardByUri({ uri: written }).catch(() => null);
    const { uri, spellings } = getResourceTarget(card, written);

    if (await isLinkAlreadyAdded({ target, links: [uri, ...spellings], userId })) {
      setFieldError('This link is already added.');
      return false;
    }

    if (!mountedRef.current || !(await waitForAuth())) return false;

    if (target.type === 'bookmarks') {
      // false: skipped, the account changed while the write waited; nothing was added.
      if (!(await BookmarkController.commitCreateResource({ uri, userId }))) return false;
      invalidateResourceBookmarks();
    } else {
      await PostController.commitUpdateCollectionResource({
        collectionId: target.collectionId,
        uri,
        shouldAdd: true,
        ...(spellings.length > 0 ? { spellings } : {}),
      });
    }

    await onSuccess?.();
    reset();
    return true;
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

async function isAlreadyAdded({ target, postId }: { target: AddContentTarget; postId: string }): Promise<boolean> {
  if (target.type === 'bookmarks') {
    return await BookmarkController.exists(postId);
  }

  // A stored item may spell the post the 0.x way (its author had not migrated when it was added).
  const { pubky, id } = parseCompositeId(postId);
  return await collectionHoldsAny(target.collectionId, postReferenceSpellings(pubky, id));
}

async function isLinkAlreadyAdded({
  target,
  links,
  userId,
}: {
  target: AddContentTarget;
  links: readonly string[];
  userId: Pubky;
}): Promise<boolean> {
  if (target.type === 'bookmarks') {
    // As `useResourceBookmarks`: a listing that failed (reported by the service) holds nothing.
    const bookmarked = await BookmarkController.fetchResourceBookmarks({ userId }).catch((): string[] => []);
    return links.some((link) => bookmarked.includes(link));
  }

  return await collectionHoldsAny(target.collectionId, links);
}

/** Whether the collection holds an item spelled as any of `spellings`. */
async function collectionHoldsAny(collectionId: string, spellings: readonly string[]): Promise<boolean> {
  const collection = await PostController.getDetails({ compositeId: collectionId });
  const currentContent =
    collection && !isPostDeleted(collection) ? CollectionPostContent.parse(collection.content) : null;

  return Boolean(currentContent?.items?.some((item) => spellings.includes(item)));
}
