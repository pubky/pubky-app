'use client';

import { useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { useUnlockedMedia } from '@/hooks/useUnlockedMedia/useUnlockedMedia';
import { isArticleContent } from '@/libs/post/articleContent';
import { ArticleReader } from '@/organisms/ArticleReader/ArticleReader';
import { PostArticle, PostArticleTitle } from '@/organisms/PostArticle/PostArticle';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostBody } from '@/organisms/PostBody/PostBody';
import type { TUnlockedListItem } from '@/services/locks/locks.types';
import { FileVariant } from '@/services/nexus/file/file.types';

/** One unlocked post, rendered from the reader's own replica. */
export function ProfileUnlockedCard({ post }: Pick<TUnlockedListItem, 'post'>) {
  // No post page to open here (announcement gone or never recorded), so the full read lives in the
  // card; opt-in keeps the list a list (#2663).
  const [isReadingArticle, setIsReadingArticle] = useState(false);
  const { media, pendingAttachments } = useUnlockedMedia({ post, preview: !isReadingArticle });

  // Same split as `PostContentBase`: an article carries its title in the content JSON, so it needs
  // the article renderer rather than plain body text. `attachments` is null throughout — the bytes
  // live in the reader's own `/priv`, not in Nexus, so they arrive as `localAttachments`.
  const isArticle = post.kind === 'long' && isArticleContent(post.content);

  return (
    <Container data-cy="profile-unlocked-card" className="gap-3 rounded-lg bg-card p-4">
      {isArticle ? (
        <>
          {isReadingArticle ? (
            <UnlockedArticleRead content={post.content} media={media} pendingAttachments={pendingAttachments} />
          ) : (
            <PostArticle
              content={post.content}
              attachments={null}
              localAttachments={media}
              pendingAttachments={pendingAttachments}
            />
          )}
          {!isReadingArticle && (
            <Button
              type="button"
              variant={ButtonVariant.OUTLINE}
              size="sm"
              className="self-start"
              onClick={() => setIsReadingArticle(true)}
            >
              Read full article
            </Button>
          )}
        </>
      ) : (
        <PostBody content={post.content} attachments={null} localAttachments={media} />
      )}
    </Container>
  );
}

function UnlockedArticleRead({
  content,
  media,
  pendingAttachments,
}: {
  content: string;
  media: AttachmentConstructed[];
  pendingAttachments: PendingAttachment[];
}) {
  const { title, body, coverImage, isCoverPending } = usePostArticle({
    content,
    attachments: null,
    localAttachments: media,
    pendingAttachments,
    coverImageVariant: FileVariant.FEED,
  });

  return (
    <>
      <PostArticleTitle title={title} />
      <Container>
        <ArticleReader
          body={body}
          coverImage={coverImage}
          isCoverPending={isCoverPending}
          articleMedia={{ localAttachments: media, pendingAttachments }}
        />
      </Container>
    </>
  );
}
