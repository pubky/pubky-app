'use client';

import { useEffect, useMemo } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { ARTICLE_ATTACHMENT_MAX_FILES } from '@/config/posts';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { serializeArticleBody } from '@/libs/post/articleInlineMedia';
import { cn } from '@/libs/utils/utils';
import { PostText } from '@/molecules/PostText/PostText';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { ArticleComposerPreviewProps } from './ArticleComposerPreview.types';

/**
 * The article as it will read once published, from the draft the composer holds.
 *
 * It renders through the published path (`PostText` with article media) rather than a read-only
 * editor: the body goes through the same serializer the publish runs, so inline files become the
 * `attachment:{n}` slots the reader resolves, and those slots are fed the composer session's local
 * entries, the same seed the publish writes to the local files store. What this shows is what the
 * article page shows a moment after publishing.
 *
 * Interaction is read-only: a click on any link, the byline's included, is cancelled before it
 * reaches the anchor (pointer or keyboard), so a tag, a mention or the author's name cannot navigate
 * away from the draft. Players still play.
 */
export function ArticleComposerPreview({
  title,
  body,
  authorPubky,
  userDetails,
  coverFile,
  coverAttachment,
  inlineMedia,
  className,
}: ArticleComposerPreviewProps) {
  // Deliberate useMemo despite the React Compiler: createObjectURL allocates a browser resource
  // whose identity drives the revoke below, and compiler memoization is an optimization, not a
  // guarantee (same reasoning as PostInputAttachments).
  const coverObjectUrl = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);
  useEffect(() => {
    return () => {
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    };
  }, [coverObjectUrl]);

  const coverAttachmentUrl = coverAttachment ? getAttachmentPreviewUrl(coverAttachment) : null;
  const cover =
    coverFile && coverObjectUrl
      ? { src: coverObjectUrl, alt: coverFile.name, type: coverFile.type }
      : coverAttachment && coverAttachmentUrl
        ? { src: coverAttachmentUrl, alt: coverAttachment.name, type: coverAttachment.type }
        : null;

  // The published form of the body. A body the publish would refuse (a hand-typed slot, too many
  // files) previews as written: the publish is where the user is told why.
  const serialized = serializeArticleBody({
    body,
    coverPresent: cover !== null,
    authorPubky,
    maxInlineMedia: ARTICLE_ATTACHMENT_MAX_FILES - (cover ? 1 : 0),
  });
  const isSerialized = serialized.errors.length === 0;
  const previewBody = isSerialized ? serialized.body : body;

  // `[cover?, ...inline]`, index-aligned with the slots the body now references. A file uploaded
  // this session renders from its object URL (the CDN may not have it yet); one kept from the
  // published article reads from the CDN, typed by its file row. A URI the session does not know
  // has no type, which the reader shows as unavailable, as the publish would refuse it.
  const localAttachments: AttachmentConstructed[] = [
    ...(cover ? [{ type: cover.type, name: cover.alt, urls: { main: cover.src } }] : []),
    ...(isSerialized ? serialized.inlineUris : []).map((uri) => ({
      type: inlineMedia.getMediaType(uri) ?? '',
      name: inlineMedia.getMediaName(uri) ?? '',
      urls: { main: inlineMedia.getPreviewUrl(uri) ?? pubkyUriToCdnUrl(uri, FileVariant.MAIN) ?? uri },
    })),
  ];

  const trimmedTitle = title.trim();
  const hasBody = body.trim().length > 0;

  return (
    <Container
      data-testid="article-composer-preview"
      className={cn('max-h-[60dvh] cursor-auto overflow-y-auto [&_a]:pointer-events-none', className)}
      // Capture phase, so Next's Link sees `defaultPrevented` and skips its client navigation too.
      // On the root: the byline links to the author's profile, exactly like a body mention would.
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
      }}
    >
      <Typography as="h1" size="2xl" className={cn('mb-6 wrap-anywhere', !trimmedTitle && 'text-muted-foreground')}>
        {trimmedTitle || 'Untitled article'}
      </Typography>

      <PostHeader postId={authorPubky} isReplyInput userDetails={userDetails} showPopover={false} size="extraLarge" />

      <Container className="mt-6 gap-6">
        {cover && (
          <Image
            src={cover.src}
            alt={cover.alt}
            className="aspect-video w-full rounded-md object-cover object-center"
            data-testid="article-composer-preview-cover"
          />
        )}

        {hasBody ? (
          <PostText content={previewBody} isArticle fullArticle articleMedia={{ localAttachments }} />
        ) : (
          <Typography className="text-muted-foreground">Nothing to preview yet.</Typography>
        )}
      </Container>
    </Container>
  );
}
