'use client';

import dynamic from 'next/dynamic';
import { forwardRef } from 'react';
import { type MDXEditorMethods, type MDXEditorProps } from '@mdxeditor/editor';
import * as Atoms from '@/atoms';

const Editor = dynamic(() => import('./InitializedMDXEditor'), {
  ssr: false,
  loading: () => (
    <Atoms.Container className="flex flex-col">
      <Atoms.Skeleton className="h-11 w-full rounded-md" />
      {/* mt-[28px] is so the skeleton is aligned with the editor placeholder */}
      <Atoms.Skeleton className="mt-[28px] h-4 w-3/5 rounded-md" />
    </Atoms.Container>
  ),
});

// This is what is imported by other components. Pre-initialized with plugins & styling, and ready
// to accept other props, including a ref.
export const MarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>((props, ref) => (
  <Editor {...props} editorRef={ref} />
));

MarkdownEditor.displayName = 'MarkdownEditor';
