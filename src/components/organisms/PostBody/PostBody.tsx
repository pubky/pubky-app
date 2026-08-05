'use client';

import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostText } from '@/molecules/PostText/PostText';
import { PostAttachments } from '../PostAttachments/PostAttachments';
import type { PostBodyProps } from './PostBody.types';

/**
 * Shared post-body renderer: text + link embeds + attachments.
 *
 * The single place that decides how a (non-article) post body renders, so the
 * normal-post and lock-teaser paths never drift apart. Used by `PostContentBase`
 * for both normal posts (→ `content`) and the lock teaser (→ `teaser_description`).
 */
export function PostBody({ content, attachments, localAttachments, textClassName, expandInPlace }: PostBodyProps) {
  const hasContent = content.trim().length > 0;

  return (
    <>
      {hasContent && <PostText content={content} className={textClassName} expandInPlace={expandInPlace} />}
      {hasContent && <PostLinkEmbeds content={content} />}
      <PostAttachments attachments={attachments} localAttachments={localAttachments} />
    </>
  );
}
