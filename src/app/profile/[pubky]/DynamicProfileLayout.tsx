'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { matchDynamicProfileRoute } from '@/app/routes';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { ProfilePageContainer } from '@/organisms/ProfilePageContainer/ProfilePageContainer';
import { ProfileProvider } from '@/providers/ProfileProvider/ProfileProvider';

/**
 * DynamicProfileLayout - Next.js layout for viewing other users' profiles
 *
 * This layout wraps children with ProfileProvider using the pubky from the URL path (never
 * `useParams`, which reports the static export's placeholder).
 * Used for routes like /profile/{pubky}, /profile/{pubky}/followers, etc.
 *
 * @see {@link ProfilePageContainer} for business logic
 * @see {@link ProfilePageLayout} for presentation
 */
export function DynamicProfileLayout({ children }: { children: React.ReactNode }) {
  const segment = matchDynamicProfileRoute(usePathname())?.pubky ?? '';
  // Decode and normalize the pubky parameter by stripping any prefix (pubky or pk:)
  // This allows URLs like /profile/pubky1abc... or /profile/pk:1abc... to work
  const decodedParam = decodeURIComponent(segment);
  const pubky = stripPubkyPrefix(decodedParam) as Pubky;

  return (
    <ProfileProvider pubky={pubky}>
      <ProfilePageContainer>{children}</ProfilePageContainer>
    </ProfileProvider>
  );
}
