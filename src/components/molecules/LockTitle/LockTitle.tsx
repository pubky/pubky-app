'use client';

import { Fragment } from 'react';
import { splitMentions } from '@/libs/post/postMentions';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PostMentions } from '@/organisms/PostMentions/PostMentions';

interface LockTitleProps {
  /** The creator-typed lock title, already defaulted by the caller. */
  title: string;
  /** Text size for a mention, so it matches the surrounding title instead of `PostMentions`' default. */
  mentionClassName?: string;
  /**
   * `false` renders mentions as plain text, as a quoted post does: for a title inside a dialog or a
   * clickable row, where a profile link and its popover would fight the surrounding click target.
   */
  interactive?: boolean;
}

/**
 * A lock title with each user key shown as `@<display name>`, rendered by `PostMentions` exactly as
 * normal post text renders a mention. The link preview resolves the same keys (#2681).
 */
export function LockTitle({ title, mentionClassName, interactive = true }: LockTitleProps) {
  const segments = splitMentions(title, () => '');
  if (!segments.some((segment) => segment.isMention)) return <>{title}</>;

  const content = segments.map((segment, index) =>
    segment.isMention ? (
      <PostMentions key={index} data-type="mention" className={mentionClassName}>
        {`pubky${segment.pubky}`}
      </PostMentions>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );

  return interactive ? (
    <>{content}</>
  ) : (
    <PostPreviewNestingProvider navigable={false}>{content}</PostPreviewNestingProvider>
  );
}
