'use client';

import * as React from 'react';
import type { ProfileContextValue, ProfileProviderProps } from './ProfileProvider.types';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * Default context value used when no provider is present
 */
const defaultContextValue: ProfileContextValue = {
  pubky: null,
  isOwnProfile: true,
  isLoading: true,
};

/**
 * Context for profile page data
 */
const ProfileContext = React.createContext<ProfileContextValue>(defaultContextValue);

/**
 * ProfileProvider
 *
 * Provides profile context to all child components in the profile pages.
 * This enables components to know which profile is being viewed and whether
 * it belongs to the current user.
 *
 * @example
 * ```tsx
 * // For the logged-in user's profile
 * <ProfileProvider>
 *   <ProfilePageContent />
 * </ProfileProvider>
 *
 * // For another user's profile
 * <ProfileProvider pubky="n1zpc53jzy">
 *   <ProfilePageContent />
 * </ProfileProvider>
 * ```
 */
export function ProfileProvider({ pubky: externalPubky, children }: ProfileProviderProps) {
  // Get current authenticated user
  const { currentUserPubky } = useAuthStore();

  // Determine which pubky to use
  const targetPubky = externalPubky ?? currentUserPubky;

  // Determine if this is the user's own profile
  // Fixed: When viewing another user's profile while unauthenticated,
  // isOwnProfile should be false, not true
  const isOwnProfile = React.useMemo(() => {
    // If external pubky is provided (viewing another user's profile)
    if (externalPubky) {
      // Only true if logged in AND viewing own profile
      return Boolean(currentUserPubky) && currentUserPubky === externalPubky;
    }
    // Own profile route (/profile/*) - only true if authenticated
    return Boolean(currentUserPubky);
  }, [currentUserPubky, externalPubky]);

  // Loading state (only loading if we don't have a pubky yet)
  const isLoading = !targetPubky;

  const contextValue = React.useMemo<ProfileContextValue>(
    () => ({
      pubky: targetPubky,
      isOwnProfile,
      isLoading,
    }),
    [targetPubky, isOwnProfile, isLoading],
  );

  return <ProfileContext.Provider value={contextValue}>{children}</ProfileContext.Provider>;
}

/**
 * Hook to access the profile context
 *
 * @returns The profile context value
 * @throws Error if used outside of ProfileProvider
 *
 * @example
 * ```tsx
 * function ProfileComponent() {
 *   const { pubky, isOwnProfile, isLoading } = useProfileContext();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!isOwnProfile) return <FollowButton pubky={pubky} />;
 *   return <EditProfileButton />;
 * }
 * ```
 */
export function useProfileContext(): ProfileContextValue {
  const context = React.useContext(ProfileContext);

  if (context === undefined) {
    throw new Error('useProfileContext must be used within a ProfileProvider');
  }

  return context;
}

// Export context for testing purposes
export { ProfileContext };
