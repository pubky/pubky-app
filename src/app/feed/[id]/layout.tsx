'use client';
import { Container } from '@/atoms/Container/Container';

import { useSelectedLayoutSegments } from 'next/navigation';

export default function FeedLayout({ post, children }: { post: React.ReactNode; children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments('post');

  // Post is active only when the intercepted route (...)post is in segments
  const isPostActive = segments.includes('(...)post');

  return (
    <>
      {/* Hide children (feed) but keep mounted to preserve scroll position */}
      <Container overrideDefaults className={isPostActive ? 'hidden' : 'contents'}>
        {children}
      </Container>

      {/* Parallel route @post - renders intercepted post page when active */}
      {post}
    </>
  );
}
