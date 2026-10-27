'use client';

import { type ComponentProps, useEffect, useState } from 'react';
import NextLink, { useLinkStatus } from 'next/link';
import { beginShopHostNavigation } from '@/libs/shop-embed/navigation';

/** Observe Next's own completion, including prefetched/no-op routes that skip pending. */
function NavigationStatus({ finish }: { finish: () => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) finish();
  }, [pending, finish]);
  return null;
}

/**
 * Keep App navigation in charge while leaving the Shop wrapper. A late iframe
 * route report otherwise calls history.replaceState and can cancel Next's pending
 * Home/Search navigation. The token lasts until Next settles or this link unmounts.
 */
export function InternalLink({ children, onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  const [navigation, setNavigation] = useState<{ finish: () => void } | null>(null);
  useEffect(() => () => navigation?.finish(), [navigation]);

  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        let canceled = false;
        onNavigate?.({
          preventDefault: () => {
            canceled = true;
            event.preventDefault();
          },
        });
        if (canceled) return;
        // onNavigate runs synchronously before Next queues the navigation, and
        // excludes modified clicks, downloads and links targeting another tab.
        const finish = beginShopHostNavigation();
        if (finish) setNavigation({ finish });
      }}
    >
      {children}
      {navigation && <NavigationStatus finish={navigation.finish} />}
    </NextLink>
  );
}
