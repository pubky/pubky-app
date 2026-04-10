'use client';

import { useEffect, useState } from 'react';
import * as Templates from '@/templates';
import { useIsMobile } from '@/hooks/useIsMobile';

/**
 * Default page for /profile/[pubky]/ route
 *
 * Mobile: shows Profile (bio/details/follow) so users can easily follow.
 * Desktop: shows Posts since the sidebar already provides follow affordances.
 */
export default function DynamicProfilePage() {
  const isMobile = useIsMobile();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Keep the first client render aligned with the server markup.
  if (hasMounted && isMobile) {
    return <Templates.ProfilePageProfile />;
  }

  return <Templates.ProfilePagePosts />;
}
