'use client';

import { useEffect, useState } from 'react';
import { ARTICLE_ATTACHMENT_MAX_FILES } from '@/config/posts';
import { FileController } from '@/controllers/file/file';
import { PostController } from '@/controllers/post/post';
import type { TEditPostAttachments } from '@/controllers/post/post.types';
import { useInlineImageUpload } from '@/hooks/useInlineImageUpload/useInlineImageUpload';
import type { InlineImageLocalEntry } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import {
  countInlineImageUris,
  serializeArticleBody,
  type SerializeArticleBodyError,
} from '@/libs/post/articleInlineImages';
import { toast } from '@/molecules/Toaster/toast';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type {
  ExistingAttachment,
  UsePostEditOptions,
  UsePostPostOptions,
  UsePostReplyOptions,
  UsePostRepostOptions,
  UsePostReturn,
} from './usePost.types';

/** User-facing copy for each publish-blocking article serialization error. */
function serializeArticleErrorMessage(error: SerializeArticleBodyError): string {
  switch (error.code) {
    case 'HAND_TYPED_ATTACHMENT_REF':
      return 'Articles cannot link images as attachment references directly. Remove them or insert the image again.';
    case 'BLOB_URI':
      return 'Articles cannot reference blob URLs. Insert the image through the editor instead.';
    case 'TOO_MANY_INLINE_IMAGES':
      return `Too many images. Articles support up to ${ARTICLE_ATTACHMENT_MAX_FILES} images including the cover.`;
    case 'RAW_HTML_FILE_URI':
      return 'Uploaded images cannot be used inside raw HTML. Use image markdown instead.';
    case 'REFERENCE_STYLE_FILE_URI':
      return 'Uploaded images cannot use reference-style links. Use inline image syntax instead.';
    case 'UNPROCESSABLE_IMAGE':
      return 'An image in the article could not be processed. Remove it and insert it again.';
  }
}

/** Maps a File to a local-store attachment entry backed by a fresh object URL. */
function fileToLocalAttachment(file: File): InlineImageLocalEntry {
  const url = URL.createObjectURL(file);
  const isImage = file.type.startsWith('image');
  return { type: file.type, name: file.name, urls: { main: url, feed: isImage ? url : undefined } };
}

/**
 * Custom hook to handle post creation or edits (replies, reposts, and root posts)
 *
 * @returns Object containing content state, setContent function, tags state, setTags function, attachments state, setAttachments function, isArticle state, setIsArticle function, articleTitle state, setArticleTitle function, reply method, post method, repost method, isSubmitting state, and error state
 *
 * @example
 * ```tsx
 * const { content, setContent, tags, setTags, attachments, setAttachments, reply, post, repost, isSubmitting, error } = usePost();
 *
 * // For replies:
 * const handleSubmit = reply({ postId: 'post-123', onSuccess: () => {} });
 *
 * // For reposts:
 * const handleSubmit = repost({ originalPostId: 'post-123', onSuccess: () => {} });
 *
 * // For root posts:
 * const handleSubmit = post({ onSuccess: () => {} });
 *
 * // For edits:
 * const handleSubmit = edit({ editPostId: 'post-123', onSuccess: () => {} });
 * ```
 */
export function usePost(): UsePostReturn {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [isArticle, setIsArticle] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (post actions return early if null)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);

  // Article inline images: uploaded at insert time, tracked per composer
  // session for previews and best-effort orphan cleanup. The insert-time
  // budget counts the cover plus the unique inline images already in the
  // body; `content` lags the editor by its 500ms debounce and in-flight
  // uploads aren't in the body yet, so `serializeArticleBody` at publish
  // remains the authoritative cap enforcement.
  const inlineImageSession = useInlineImageUpload({
    enabled: isArticle,
    authorPubky: currentUserId,
    getInlineBudget: () =>
      ARTICLE_ATTACHMENT_MAX_FILES -
      Math.min(attachments.length + existingAttachments.length, 1) -
      (currentUserId ? countInlineImageUris(content, currentUserId) : 0),
  });

  /**
   * Serializes an article body for publishing: rewrites author-owned inline
   * file URIs to `attachment:{n}` slots. Returns null (after toasting) when
   * the body contains destinations that block publishing.
   */
  const serializeArticleForPublish = (coverPresent: boolean): { body: string; inlineUris: string[] } | null => {
    if (!currentUserId) return null;
    const serialized = serializeArticleBody({
      body: content.trim(),
      coverPresent,
      authorPubky: currentUserId,
      maxInlineImages: ARTICLE_ATTACHMENT_MAX_FILES - (coverPresent ? 1 : 0),
    });
    if (serialized.errors.length > 0) {
      toast({ variant: 'error', description: serializeArticleErrorMessage(serialized.errors[0]) });
      return null;
    }
    return { body: serialized.body, inlineUris: serialized.inlineUris };
  };

  /**
   * Blocks (with a toast) inline images whose files this article may not
   * manage: every attachment slot is subject to hard deletion when a later
   * edit drops it, so a file shared with another post would break that post
   * permanently. Only files uploaded this composer session — or, for edits,
   * the post's own original attachments — may become attachment slots.
   */
  const rejectForeignInlineUris = (inlineUris: string[], originalUris: readonly string[] = []): boolean => {
    const originalSet = new Set(originalUris);
    const hasForeign = inlineUris.some(
      (uri) => inlineImageSession.getPreviewUrl(uri) === null && !originalSet.has(uri),
    );
    if (!hasForeign) return false;

    toast({
      variant: 'error',
      description:
        'Some images reference files from outside this article. Remove them, or insert the images again so they upload fresh.',
    });
    return true;
  };

  /**
   * Seeds the local files store with `[cover?, ...inline]` entries so the
   * creating session renders instantly (the CDN may not have generated
   * variants yet). Entries must be complete and index-aligned with the post's
   * attachments; if any is unknown (e.g. an inline image kept from a previous
   * session), the entry is cleared and the Dexie/CDN path takes over.
   */
  /**
   * Completes inline seed entries: URIs uploaded this session keep their
   * object URLs; URIs kept from previous sessions fall back to locally cached
   * metadata + CDN URLs (long since generated for old files). Without this,
   * one kept file would void the whole seed — stripping fresh uploads
   * (including a brand-new cover) of their object URLs and exposing them to
   * the CDN variant-readiness window, where fresh variants 404 for a while.
   */
  const completeInlineSeedEntries = async (inlineUris: string[]): Promise<(InlineImageLocalEntry | null)[]> => {
    const sessionEntries = inlineImageSession.buildLocalAttachmentEntries(inlineUris);
    const missingUris = inlineUris.filter((_, index) => sessionEntries[index] === null);
    if (missingUris.length === 0) return sessionEntries;

    try {
      const metadata = await FileController.getMetadata({ fileAttachments: missingUris });
      const metadataByUri = new Map(metadata.map((file) => [file.uri, file]));
      return inlineUris.map((uri, index) => {
        const sessionEntry = sessionEntries[index];
        if (sessionEntry) return sessionEntry;
        const fileMetadata = metadataByUri.get(uri);
        if (!fileMetadata) return null;
        return {
          type: fileMetadata.content_type,
          name: fileMetadata.name,
          urls: {
            main: FileController.getFileUrl({ fileId: fileMetadata.id, variant: FileVariant.MAIN }),
            feed: fileMetadata.content_type.startsWith('image')
              ? FileController.getFileUrl({ fileId: fileMetadata.id, variant: FileVariant.FEED })
              : undefined,
          },
        };
      });
    } catch {
      // Best-effort: an incomplete seed just defers rendering to the Dexie/CDN path
      return sessionEntries;
    }
  };

  const seedArticleLocalFiles = (postId: string, entries: (InlineImageLocalEntry | null)[]) => {
    const complete = entries.every((entry) => entry !== null);
    useLocalFilesStore.getState().setPostAttachments(postId, complete ? (entries as InlineImageLocalEntry[]) : []);
  };

  const reply = async ({ postId, onSuccess }: UsePostReplyOptions) => {
    // allow empty content and attachments
    if ((!content.trim() && attachments.length === 0) || !postId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await PostController.commitCreate({
        parentPostId: postId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      toast({
        title: 'Reply posted',
        dismissButton: true,
      });
      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to submit reply:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not post reply. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const post = async ({ onSuccess }: UsePostPostOptions) => {
    // allow empty content and attachments if not article
    if (
      (!content.trim() && attachments.length === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim())) ||
      !currentUserId
    )
      return;

    setIsSubmitting(true);
    // From here until finally, discarding the session must not delete files:
    // the commit may succeed and the published article would reference them
    inlineImageSession.setCommitting(true);

    try {
      let articleBody = '';
      let inlineUris: string[] = [];
      if (isArticle) {
        const serialized = serializeArticleForPublish(attachments.length > 0);
        if (!serialized) return;
        if (rejectForeignInlineUris(serialized.inlineUris)) return;
        articleBody = serialized.body;
        inlineUris = serialized.inlineUris;
      }

      const createdPostId = await PostController.commitCreate({
        content: isArticle ? JSON.stringify({ title: articleTitle.trim(), body: articleBody }) : content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        attachmentUris: inlineUris.length > 0 ? inlineUris : undefined,
        isArticle,
      });

      if (isArticle) {
        // Build entries before finalizeSession clears the session map; the
        // referenced object URLs' ownership moves to the store.
        seedArticleLocalFiles(createdPostId, [
          ...attachments.map(fileToLocalAttachment),
          ...(await completeInlineSeedEntries(inlineUris)),
        ]);
        void inlineImageSession.finalizeSession(inlineUris);
      }

      setContent('');
      setTags([]);
      setAttachments([]);
      setIsArticle(false);
      setArticleTitle('');
      toast({
        title: 'Post published',
      });
      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to create post:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not create post. Try again.',
      });
    } finally {
      inlineImageSession.setCommitting(false);
      setIsSubmitting(false);
    }
  };

  const repost = async ({
    originalPostId,
    originalAuthorName,
    successToastTitle,
    onSuccess,
    onUndo,
  }: UsePostRepostOptions) => {
    if (!originalPostId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await PostController.commitCreate({
        originalPostId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);

      toast({
        title: successToastTitle ?? (originalAuthorName ? `Reposted ${originalAuthorName}'s post` : 'Reposted'),
        action: { label: 'Undo', altText: 'Undo', onClick: () => onUndo(createdPostId) },
      });

      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to repost:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not repost. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const edit = async ({
    editPostId,
    originalAttachmentUris,
    preservedAttachmentUris,
    onSuccess,
  }: UsePostEditOptions) => {
    // allow empty content when attachments remain; articles require content and title
    const totalAttachments = existingAttachments.length + attachments.length;
    if (
      (!content.trim() && totalAttachments === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim())) ||
      !editPostId ||
      !currentUserId
    )
      return;

    setIsSubmitting(true);
    // From here until finally, discarding the session must not delete files:
    // the commit may succeed and the edited article would reference them
    inlineImageSession.setCommitting(true);

    try {
      let editContentPayload: string;
      let editAttachments: TEditPostAttachments | undefined;
      let articleSeedEntries: (InlineImageLocalEntry | null)[] | undefined;
      let articleNextOrder: string[] | undefined;

      if (isArticle) {
        // Article edits use the slot-ordered `nextOrder` contract: the cover
        // (kept or freshly uploaded) occupies slot 0, inline body images
        // follow in first-appearance order.
        const keptCover = existingAttachments[0];
        const newCoverFile: File | undefined = attachments[0];

        // Validate the body before uploading a replacement cover, so a blocked
        // publish uploads nothing.
        const serialized = serializeArticleForPublish(Boolean(newCoverFile ?? keptCover));
        if (!serialized) return;

        // Removal is diffed against the seeded snapshot, never the live row.
        const originalUris = originalAttachmentUris ?? existingAttachments.map((attachment) => attachment.uri);
        const originalSet = new Set(originalUris);
        if (rejectForeignInlineUris(serialized.inlineUris, originalUris)) return;

        let coverUri = keptCover?.uri;
        if (newCoverFile) {
          coverUri = await FileController.commitCreate({ file: newCoverFile, pubky: currentUserId });
          // Joining the session means a failed commit below leaves cleanup to
          // the session's discard sweep.
          inlineImageSession.registerSessionUpload(coverUri, newCoverFile);
        }
        const referencedOrder = [...(coverUri ? [coverUri] : []), ...serialized.inlineUris];
        // Original attachments the user was never shown (not the cover, not
        // referenced by the body at open) ride at the tail so an unrelated
        // edit never deletes files the user did not see and remove. Slots of
        // referenced images are unaffected by the tail.
        const referencedOrderSet = new Set(referencedOrder);
        const nextOrder = [
          ...referencedOrder,
          ...(preservedAttachmentUris ?? []).filter((uri) => originalSet.has(uri) && !referencedOrderSet.has(uri)),
        ];

        // The serialize cap covers cover + inline only; the preserved tail
        // can push the total past the spec limit, which would otherwise
        // surface as an opaque spec error from `builder.editPost`
        if (nextOrder.length > ARTICLE_ATTACHMENT_MAX_FILES) {
          toast({
            variant: 'error',
            description: `Articles support up to ${ARTICLE_ATTACHMENT_MAX_FILES} attachments, including the cover and attachments kept from previous versions. Remove some images to save.`,
          });
          return;
        }
        const kept = [...new Set(nextOrder.filter((uri) => originalSet.has(uri)))];
        const addedUris = [...new Set(nextOrder.filter((uri) => !originalSet.has(uri)))];
        const orderChanged =
          nextOrder.length !== originalUris.length || nextOrder.some((uri, index) => uri !== originalUris[index]);

        editContentPayload = JSON.stringify({ title: articleTitle.trim(), body: serialized.body });
        editAttachments = orderChanged ? { original: originalUris, kept, added: [], addedUris, nextOrder } : undefined;
        articleNextOrder = nextOrder;

        // undefined = no cover; null = cover exists but has no resolved URLs
        const coverEntry = newCoverFile
          ? fileToLocalAttachment(newCoverFile)
          : keptCover
            ? keptCover.urls
              ? { type: keptCover.type, name: keptCover.name, urls: keptCover.urls }
              : null
            : undefined;
        // Seed entries must be index-aligned with the FULL nextOrder,
        // including the preserved tail (metadata completion covers it)
        articleSeedEntries = [
          ...(coverEntry === undefined ? [] : [coverEntry]),
          ...(await completeInlineSeedEntries(nextOrder.slice(coverUri ? 1 : 0))),
        ];
      } else {
        // Removal is the only mutation of kept attachments (no reordering), so a
        // count comparison against the seeded snapshot detects any change.
        const keptUris = existingAttachments.map((attachment) => attachment.uri);
        const originalUris = originalAttachmentUris ?? keptUris;
        const attachmentsChanged = attachments.length > 0 || keptUris.length !== originalUris.length;
        editContentPayload = content.trim();
        editAttachments = attachmentsChanged
          ? { original: originalUris, kept: keptUris, added: attachments }
          : undefined;
      }

      await PostController.commitEdit({
        compositePostId: editPostId,
        content: editContentPayload,
        attachments: editAttachments,
      });

      if (isArticle && articleSeedEntries && articleNextOrder) {
        seedArticleLocalFiles(editPostId, articleSeedEntries);
        void inlineImageSession.finalizeSession(articleNextOrder);
      }

      setContent('');
      setAttachments([]);
      setExistingAttachments([]);
      setIsArticle(false);
      setArticleTitle('');
      toast({
        title: 'Post updated',
      });
      onSuccess?.(editPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to edit post:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not update post. Try again.',
      });
    } finally {
      inlineImageSession.setCommitting(false);
      setIsSubmitting(false);
    }
  };

  // Clear attachments when switching to article mode.
  // `existingAttachments` is deliberately excluded: it is only populated in
  // edit mode, where `isArticle` flips true during prefill in the same commit
  // window that seeds the article cover — including it here would wipe the
  // seeded cover on mount. The article button is hidden in edit mode, so a
  // user-initiated switch can never happen with `existingAttachments` set.
  useEffect(() => {
    if (isArticle && attachments.length > 0) {
      toast({
        variant: 'warning',
        title: 'Articles support one cover image',
      });
      setAttachments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on isArticle change, not attachments
  }, [isArticle]);

  return {
    content,
    setContent,
    tags,
    setTags,
    attachments,
    setAttachments,
    existingAttachments,
    setExistingAttachments,
    isArticle,
    setIsArticle,
    articleTitle,
    setArticleTitle,
    reply,
    post,
    repost,
    edit,
    isSubmitting,
    inlineImages: {
      upload: inlineImageSession.uploadInlineImage,
      getPreviewUrl: inlineImageSession.getPreviewUrl,
    },
    uploadingCount: inlineImageSession.uploadingCount,
  };
}
