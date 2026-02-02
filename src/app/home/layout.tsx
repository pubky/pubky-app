'use client';

// Learn more about Next.js parallel and intercepted routes:
// https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes#modals

import * as Atoms from '@/atoms';
import { useSelectedLayoutSegments } from 'next/navigation';

export default function HomeLayout({ post, children }: { post: React.ReactNode; children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments('post');

  // Post is active only when the intercepted route (..)post is in segments
  const isPostActive = segments.includes('(..)post');

  return (
    <>
      {/* Hide children (feed) but keep mounted to preserve scroll position */}
      <Atoms.Container overrideDefaults className={isPostActive ? 'hidden' : 'contents'}>
        {children}
      </Atoms.Container>

      {/* Parallel route @post - renders intercepted post page when active */}
      {post}
    </>
  );
}
