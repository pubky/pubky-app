'use client';

import type { HTMLAttributes } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export type PostCodeBlockHighlighterProps = HTMLAttributes<HTMLElement> & {
  language: string;
  code: string;
};

/**
 * Highlighted body of a fenced code block.
 *
 * Split out of {@link PostCodeBlock} so the highlighter can be loaded on demand:
 * `react-syntax-highlighter` (prism plus the oneDark theme) is the largest single
 * dependency a post body can pull in, and a post with no fenced block never needs it.
 */
export const PostCodeBlockHighlighter = ({ language, code, ...rest }: PostCodeBlockHighlighterProps) => (
  <SyntaxHighlighter
    {...rest}
    PreTag="div"
    language={language}
    style={oneDark}
    customStyle={{
      margin: 0,
      borderRadius: 0,
    }}
  >
    {code}
  </SyntaxHighlighter>
);
