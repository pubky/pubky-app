import * as React from 'react';
import * as Organisms from '@/organisms';
import { ProfileProvider } from '@/providers/ProfileProvider/ProfileProvider';

/**
 * ProfileLayout - Next.js layout for profile pages (own profile)
 *
 * This layout wraps children with ProfileProvider (using current user's pubky)
 * and delegates business logic to ProfilePageContainer.
 *
 * For the logged-in user's own profile pages at /profile/*
 *
 * @see {@link ProfilePageContainer} for business logic
 * @see {@link ProfilePageLayout} for presentation
 */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <Organisms.ProfilePageContainer>{children}</Organisms.ProfilePageContainer>
    </ProfileProvider>
  );
}
