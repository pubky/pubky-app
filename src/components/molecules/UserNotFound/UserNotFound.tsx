'use client';

import { UserX } from 'lucide-react';
import { ProfilePageEmptyState } from '../ProfilePageEmptyState/ProfilePageEmptyState';

/**
 * UserNotFound - Empty state component for when a user profile is not found
 *
 * Displayed when navigating to a profile URL with a pubky that doesn't exist.
 */
export function UserNotFound() {
  return (
    <ProfilePageEmptyState
      imageSrc="/images/connections-empty-state.webp"
      imageAlt="User not found"
      icon={UserX}
      title="User not found"
      subtitle="The user you're looking for doesn't exist or may have been removed."
    />
  );
}
