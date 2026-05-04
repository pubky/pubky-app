'use client';

import { ClassAttributes, HTMLAttributes, useEffect, useState } from 'react';
import type { ExtraProps } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

import { Check, Clipboard } from 'lucide-react';
import { cn, copyToClipboard } from '@/libs/utils/utils';
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

      <SyntaxHighlighter
        {...rest}
        PreTag="div"
        language={lang}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
        }}
      >
        {codeSyntaxHighlight}
      </SyntaxHighlighter>
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
