'use client';

import { memo, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { POST_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { PostMentions } from '@/organisms/PostMentions/PostMentions';
import { PostCodeBlock } from '../PostCodeBlock/PostCodeBlock';
import { PostHashtags } from '../PostHashtags/PostHashtags';
import { INLINE_LINK_CLASSNAME } from './PostText.constants';
import { PostTextProps, RemarkAnchorProps, RemarkButtonProps } from './PostText.types';
import {
  remarkDisallowMarkdownLinks,
  remarkExtractFirstParagraph,
  remarkHashtags,
  remarkInlineShowMore,
  remarkMentions,
  remarkPlaintextCodeblock,
  remarkPlaintextTables,
  truncatePostPreviewText,
} from './PostText.utils';
import { PostTextLink } from './PostTextLink';

/**
 * Renders formatted text content with markdown, hashtags, mentions, and links.
 *
 * Used for:
 * - Post content in feeds and post pages
 * - User bio in profile popovers
 *
 * Features:
 * - Markdown formatting (bold, italic, code, lists, etc.)
 * - Hashtag parsing (#tag → clickable search link)
 * - Mention parsing (pk:... or pubky... → clickable profile link)
 * - Compact URL detection and linking with full-value tooltips
 * - Content truncation with an inline "more" control on non-post pages
 *
 * Compacted URLs render a tooltip, so this needs a `TooltipProvider` ancestor;
 * the app-wide one in `src/app/layout.tsx` covers every current caller.
 *
 * Memoization prevents unnecessary re-renders when TTL refreshes update IndexedDB records
 * without changes to the actual post content.
 */
export const PostText = memo(function PostText({
  content,
  isArticle,
  compactUrls = true,
  onLinkClick,
  className,
}: PostTextProps) {
  const pathname = usePathname();
  const onPostPage = pathname.startsWith(POST_ROUTES.POST);
  const [isExpanded, setIsExpanded] = useState(false);

  const contentTruncated = !isArticle && !onPostPage && !isExpanded ? truncatePostPreviewText(content) : null;
  const showMoreButton = Boolean(contentTruncated);

  const remarkPlugins = [
    remarkGfm,
    remarkPlaintextTables,
    ...(isArticle ? (!onPostPage ? [remarkExtractFirstParagraph] : []) : [remarkDisallowMarkdownLinks]),
    remarkPlaintextCodeblock,
    remarkHashtags,
    remarkMentions,
    ...(showMoreButton ? [remarkInlineShowMore] : []),
  ];

  // Memoize allowed elements array to avoid recreation on every render
  const allowedElements = useMemo(
    () => [
      'em',
      'strong',
      'code',
      'pre',
      'a',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'del',
      'blockquote',
      'hr',
      'button',
      ...(isArticle ? ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] : []),
    ],
    [isArticle],
  );

  return (
    <Container
      data-cy="post-text"
      overrideDefaults
      className={cn(
        'text-base leading-6 font-medium wrap-anywhere whitespace-pre-line text-secondary-foreground',
        className,
      )}
    >
      <Markdown
        allowedElements={allowedElements}
        unwrapDisallowed
        remarkPlugins={remarkPlugins}
        components={{
          a(props: RemarkAnchorProps) {
            const { 'data-type': dataType } = props;

            if (dataType === 'hashtag') return <PostHashtags {...props} />;
            if (dataType === 'mention') return <PostMentions {...props} />;

            return <PostTextLink {...props} compactUrl={compactUrls} onLinkClick={onLinkClick} />;
          },
          blockquote(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <blockquote {...rest} className={cn(className, 'border-l-4 border-foreground pl-4 whitespace-normal')}>
                {children}
              </blockquote>
            );
          },
          ol(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <ol {...rest} className={cn(className, 'list-inside list-decimal whitespace-normal')}>
                {children}
              </ol>
            );
          },
          ul(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <ul {...rest} className={cn(className, 'list-inside list-disc whitespace-normal')}>
                {children}
              </ul>
            );
          },
          code(props) {
            return <PostCodeBlock {...props} />;
          },
          button(props: RemarkButtonProps) {
            const { children, className, 'data-type': dataType, node: _node, ref: _ref, ...rest } = props;

            if (dataType !== 'show-more') return children;

            return (
              <Button
                {...rest}
                overrideDefaults
                className={cn(className, INLINE_LINK_CLASSNAME)}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExpanded(true);
                }}
              >
                {children}
              </Button>
            );
          },
          h1(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h1 {...rest} className={cn(className, 'text-2xl leading-8 font-bold text-white')}>
                {children}
              </h1>
            );
          },
          h2(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h2 {...rest} className={cn(className, 'text-xl leading-7 font-bold text-white')}>
                {children}
              </h2>
            );
          },
          h3(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h3 {...rest} className={cn(className, 'text-lg leading-7 font-bold text-white')}>
                {children}
              </h3>
            );
          },
          h4(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h4 {...rest} className={cn(className, 'text-[17px] leading-6 font-bold text-white')}>
                {children}
              </h4>
            );
          },
          h5(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h5 {...rest} className={cn(className, 'text-[16.5px] leading-6 font-light text-muted-foreground')}>
                {children}
              </h5>
            );
          },
          h6(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h6 {...rest} className={cn(className, 'text-[16.25px] leading-6 font-light text-muted-foreground')}>
                {children}
              </h6>
            );
          },
        }}
      >
        {contentTruncated || content}
      </Markdown>
    </Container>
  );
});
