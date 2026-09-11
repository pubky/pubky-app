'use client';

import { Library, Plus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogNewCollection } from '@/organisms/Collections/DialogNewCollection/DialogNewCollection';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

/**
 * Empty state for the profile Collections tab. Own profile gets a
 * "Create Collection" CTA that acts as the `DialogNewCollection` trigger;
 * visitors see read-only copy. `isOwnProfile` already implies an authenticated
 * viewer, so the CTA needs no extra auth gate.
 */
export function CollectionsEmpty() {
  const { isOwnProfile } = useProfileContext();

  return (
    <IllustratedEmptyState
      imageSrc="/images/notifications-empty-state.webp"
      imageAlt={'Collections - Empty state'}
      icon={Library}
      title={'No collections yet'}
      subtitle={
        isOwnProfile
          ? 'Curate ideas, filter signal from noise, and share what matters.'
          : "This user hasn't created any collections yet."
      }
    >
      {isOwnProfile && (
        <DialogNewCollection>
          <Button
            type="button"
            variant="default"
            size="default"
            className="gap-2"
            data-cy="profile-collections-empty-create-collection"
          >
            <Plus className="size-4" />
            <Typography as="span" overrideDefaults={true}>
              {'Create Collection'}
            </Typography>
          </Button>
        </DialogNewCollection>
      )}
    </IllustratedEmptyState>
  );
}
