'use client';

import { ClassAttributes, HTMLAttributes, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, Clipboard } from 'lucide-react';
import type { ExtraProps } from 'react-markdown';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { cn, copyToClipboard } from '@/libs/utils/utils';

/**
 * The highlighter (prism plus the oneDark theme) is the largest dependency a post body can
 * pull in and only fenced blocks need it, so it is loaded on demand: an inline `code` span, or
 * a post with no code at all, never fetches the chunk. `ssr: false` because the post body is
 * rendered on the client anyway, and the skeleton holds the box's height so the content below
 * does not jump when the chunk lands.
 */
const PostCodeBlockHighlighter = dynamic(
  () => import('./PostCodeBlockHighlighter').then((module) => module.PostCodeBlockHighlighter),
  {
    ssr: false,
    loading: () => (
      <Container overrideDefaults className="flex flex-col gap-y-2 rounded-b-md bg-neutral-800 p-4">
        <Skeleton className="h-4 w-3/4 rounded-sm" />
        <Skeleton className="h-4 w-1/2 rounded-sm" />
      </Container>
    ),
  },
);

type PostCodeBlockProps = ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & ExtraProps;
export const PostCodeBlock = (props: PostCodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const { children, className, node: _node, ref: _ref, ...rest } = props;
  const lang = /language-(\w+)/.exec(className || '')?.[1];
  const codeSyntaxHighlight = String(children).replace(/\n$/, '');
  const copyCodeBlock = async () => {
    if (copied) return;
    try {
      await copyToClipboard({
        text: codeSyntaxHighlight,
      });
      setCopied(true);
    } catch {
      // TODO: add error handling
    }
  };
  useEffect(() => {
    if (copied) {
      const timeoutId = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [copied]);
  return lang ? (
    // Full code block with syntax highlighting and copy functionality (ex. ``` or ```ts)
    <Container overrideDefaults className="max-w-69.5 xsm:max-w-72 sm:max-w-120 md:max-w-168 lg:max-w-130 xl:max-w-175">
      <Container className="flex-row items-center justify-between gap-x-2 rounded-t-md bg-gray-600 px-4">
        <Typography size="sm">{lang}</Typography>

        <Button
          onClick={(e) => {
            e.stopPropagation();
            copyCodeBlock();
          }}
          variant="ghost"
          size="sm"
          className="hover:bg-transparent hover:opacity-50"
        >
          {copied ? <Check size={16} /> : <Clipboard size={16} />}

          <Typography size="sm">{copied ? 'Copied!' : 'Copy'}</Typography>
        </Button>
      </Container>

      <PostCodeBlockHighlighter {...rest} language={lang} code={codeSyntaxHighlight} />
    </Container>
  ) : (
    // Inline code block (ex. ``)
    <code
      {...rest}
      className={cn(className, 'rounded border border-white/10 bg-neutral-800 px-1 font-mono text-orange-500')}
    >
      {children}
    </code>
  );
};
