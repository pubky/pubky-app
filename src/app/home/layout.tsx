'use client';
import { useEffect } from 'react';
import { useSelectedLayoutSegments } from 'next/navigation';
import { Container } from '@/atoms/Container/Container';

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

export default function HomeLayout({ post, children }: { post: React.ReactNode; children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments('post');

  // Post is active only when the intercepted route (..)post is in segments
  const isPostActive = segments.includes('(..)post');

  useEffect(() => {
    if (window.sessionStorage.getItem(FORCE_HOME_SCROLL_TOP_KEY) !== '1') return;

    window.sessionStorage.removeItem(FORCE_HOME_SCROLL_TOP_KEY);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, []);

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
