'use client';

import { memo, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Markdown, { defaultUrlTransform, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { POST_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { ArticleInlineImage } from '@/molecules/ArticleInlineImage/ArticleInlineImage';
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
  remarkSoftBreaks,
  remarkStripImages,
  truncatePostPreviewText,
} from './PostText.utils';
import { PostTextLink } from './PostTextLink';

// Compact posts put list markers inside the content box. A "loose" markdown list
// (blank lines between items) wraps each item's text in a block-level <p>, which
// would push the inline marker onto a line of its own — render the item's first
// paragraph inline so the marker and its text share a line. Full articles rely on
// prose styling instead (outside markers with padding), which handles loose items.
const compactListClassName = (listStyle: 'list-decimal' | 'list-disc') =>
  cn('list-inside whitespace-normal [&>li>p:first-child]:inline', listStyle);
// Image `src` values pass through raw so ArticleInlineImage can resolve the
// custom schemes (`attachment:{n}`, `pubky://`) itself — the default transform
// would strip them. Everything else (hrefs, …) keeps the default policy.
const articleImageUrlTransform: UrlTransform = (url, key, node) =>
  key === 'src' && node.tagName === 'img' ? url : defaultUrlTransform(url);

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
  fullArticle,
  articleImages,
  compactUrls = true,
  onLinkClick,
  className,
}: PostTextProps) {
  const pathname = usePathname();
  const onPostPage = pathname.startsWith(POST_ROUTES.POST);
  const [isExpanded, setIsExpanded] = useState(false);

  const contentTruncated = !isArticle && !onPostPage && !isExpanded ? truncatePostPreviewText(content) : null;
  const showMoreButton = Boolean(contentTruncated);

  // Inline images render only on surfaces that explicitly pass articleImages
  // (the article detail page) — never based on the current pathname, which
  // would also full-render embedded article cards on post pages.
  const renderArticleImages = Boolean(isArticle && articleImages);

  const remarkPlugins = [
    remarkGfm,
    remarkPlaintextTables,
    ...(isArticle
      ? [
          ...(renderArticleImages ? [] : [remarkStripImages]),
          ...(!onPostPage && !fullArticle ? [remarkExtractFirstParagraph] : []),
        ]
      : [remarkDisallowMarkdownLinks]),
    remarkPlaintextCodeblock,
    remarkHashtags,
    remarkMentions,
    ...(showMoreButton ? [remarkInlineShowMore] : []),
    ...(fullArticle ? [remarkSoftBreaks] : []),
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
      ...(renderArticleImages ? ['img'] : []),
    ],
    [isArticle, renderArticleImages],
  );

  return (
    <Container
      data-cy="post-text"
      overrideDefaults
      className={cn(
        'text-base leading-6 font-medium wrap-anywhere',
        // Full articles use the same `prose` typography as the article editor so the
        // published article matches what the editor shows (issue #1762): real block
        // margins and outside list markers instead of the pre-line whitespace hack.
        // The editor neutralizes prose's inline-code backticks; the pre overrides
        // strip prose's box and 14px typography from the <pre> wrapping PostCodeBlock
        // so code blocks keep their compact-post look (prose still spaces them);
        // no-underline keeps links, hashtags and mentions on their brand styling.
        // Compact posts keep pre-line, where the stray newlines react-markdown emits
        // between blocks provide the spacing.
        fullArticle
          ? 'prose max-w-none prose-neutral prose-invert prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:text-base prose-pre:leading-6 prose-pre:font-medium [&_a]:no-underline'
          : 'whitespace-pre-line',
        'text-secondary-foreground',
        className,
      )}
    >
      <Markdown
        allowedElements={allowedElements}
        unwrapDisallowed
        remarkPlugins={remarkPlugins}
        urlTransform={renderArticleImages ? articleImageUrlTransform : undefined}
        components={{
          ...(renderArticleImages && articleImages
            ? {
                img(props: { src?: string | Blob; alt?: string }) {
                  return (
                    <ArticleInlineImage
                      src={typeof props.src === 'string' ? props.src : undefined}
                      alt={props.alt}
                      attachments={articleImages.attachments}
                      authorId={articleImages.authorId}
                      postId={articleImages.postId}
                    />
                  );
                },
              }
            : {}),
          a(props: RemarkAnchorProps) {
            const { 'data-type': dataType } = props;

            if (dataType === 'hashtag') return <PostHashtags {...props} />;
            if (dataType === 'mention') return <PostMentions {...props} />;

            return <PostTextLink {...props} compactUrl={compactUrls} onLinkClick={onLinkClick} />;
          },
          blockquote(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            // not-italic, [quotes:none] and the explicit color neutralize the prose
            // blockquote decorations in full articles (injected curly quotes, italics,
            // --tw-prose-quotes color) that the author never wrote and the editor never
            // shows; they are no-ops in compact posts, which have no prose styling.
            return (
              <blockquote
                {...rest}
                className={cn(
                  className,
                  'border-l-4 border-foreground pl-4 whitespace-normal text-secondary-foreground not-italic [quotes:none]',
                )}
              >
                {children}
              </blockquote>
            );
          },
          ol(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <ol {...rest} className={cn(className, !fullArticle && compactListClassName('list-decimal'))}>
                {children}
              </ol>
            );
          },
          ul(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <ul {...rest} className={cn(className, !fullArticle && compactListClassName('list-disc'))}>
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
              <h5
                {...rest}
                className={cn(
                  className,
                  'text-[16.5px] leading-6 font-light text-muted-foreground',
                  // @tailwindcss/typography styles h1-h4 only, so give h5/h6 the same
                  // margin scale as prose h4 in full articles; without it they would
                  // sit flush between paragraphs now that pre-line no longer applies.
                  fullArticle && 'mt-[1.5em] mb-[0.5em]',
                )}
              >
                {children}
              </h5>
            );
          },
          h6(props) {
            const { children, className, node: _node, ref: _ref, ...rest } = props;

            return (
              <h6
                {...rest}
                className={cn(
                  className,
                  'text-[16.25px] leading-6 font-light text-muted-foreground',
                  fullArticle && 'mt-[1.5em] mb-[0.5em]',
                )}
              >
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
