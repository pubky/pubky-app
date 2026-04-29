'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import * as Organisms from '@/organisms';
import * as Providers from '@/providers';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
/**
 * DynamicProfileLayout - Next.js layout for viewing other users' profiles
 *
 * This layout wraps children with ProfileProvider using the pubky from URL params.
 * Used for routes like /profile/{pubky}/followers, /profile/{pubky}/posts, etc.
 *
 * @see {@link ProfilePageContainer} for business logic
 * @see {@link ProfilePageLayout} for presentation
 */
export default function DynamicProfileLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  // Decode and normalize the pubky parameter by stripping any prefix (pubky or pk:)
  // This allows URLs like /profile/pubky1abc... or /profile/pk:1abc... to work
  const decodedParam = decodeURIComponent(params.pubky as string);
  const pubky = stripPubkyPrefix(decodedParam) as Pubky;

  return (
    <Providers.ProfileProvider pubky={pubky}>
      <Organisms.ProfilePageContainer>{children}</Organisms.ProfilePageContainer>
    </Providers.ProfileProvider>
  );
}
