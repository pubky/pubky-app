'use client';

import { forwardRef } from 'react';
import dynamic from 'next/dynamic';
import { type MDXEditorMethods, type MDXEditorProps } from '@mdxeditor/editor';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

const Editor = dynamic(() => import('./InitializedMDXEditor'), {
  ssr: false,
  loading: () => (
    <Container className="flex flex-col">
      <Skeleton className="h-11 w-full rounded-md" />
      {/* mt-[28px] is so the skeleton is aligned with the editor placeholder */}
      <Skeleton className="mt-[28px] h-4 w-3/5 rounded-md" />
    </Container>
  ),
});

// This is what is imported by other components. Pre-initialized with plugins & styling, and ready
// to accept other props, including a ref.
export const MarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>((props, ref) => (
  <Editor {...props} editorRef={ref} />
));

MarkdownEditor.displayName = 'MarkdownEditor';
