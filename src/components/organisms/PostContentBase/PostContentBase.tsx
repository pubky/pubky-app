'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import type { PostContentBaseProps } from './PostContentBase.types';

/**
 * PostContentBase - Base component that renders post content without repost handling.
 * This component is used internally by PostContent and PostPreviewCard.
 * It only renders the content elements: text, link embeds, and attachments.
 */
export function PostContentBase({ postId, className }: PostContentBaseProps) {
  const t = useTranslations('common');

  const localAttachments = Core.useLocalFilesStore((s) => s.posts[postId]);

  // Fetch post details for content
  const { postDetails } = Hooks.usePostDetails(postId);

  if (!postDetails) {
    // TODO: Add skeleton loading component for PostContent
    return <div className="text-muted-foreground">{t('loadingContent')}</div>;
  }

  const isDeleted = Libs.isPostDeleted(postDetails.content);
  const hasContent = postDetails.content.trim().length > 0;
  const isBlurred = postDetails.is_blurred;
  const isArticle = postDetails.kind === 'long';

  if (isDeleted) return <Molecules.PostDeleted />;

  if (isBlurred) return <Organisms.PostContentBlurred postId={postId} className={className} />;

  if (isArticle)
    return (
      <Organisms.PostArticle
        content={postDetails.content}
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        className={className}
      />
    );

  return (
    <Atoms.Container className={Libs.cn('min-w-0 gap-3', className)}>
      {/* Post text */}
      {hasContent && <Molecules.PostText content={postDetails.content} />}

      {/* Link previews from text */}
      {hasContent && <Molecules.PostLinkEmbeds content={postDetails.content} />}

      {/* Attachments on this post */}
      <Organisms.PostAttachments attachments={postDetails.attachments} localAttachments={localAttachments} />
    </Atoms.Container>
  );
}
