'use client';

import { useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function RepliesEmpty() {
  const [newPostOpen, setNewPostOpen] = useState(false);
  const { isOwnProfile } = useProfileContext();
  const { requireAuth } = useRequireAuth();

  const handleCreatePostClick = () => {
    requireAuth(() => setNewPostOpen(true));
  };

  return (
    <>
      <IllustratedEmptyState
        imageSrc="/images/posts-replies-empty-state.webp"
        imageAlt={'Replies - Empty state'}
        icon={UsersRound}
        title={'No replies yet'}
        subtitle={isOwnProfile ? 'Find a post in your feed to reply to.' : "This user hasn't replied yet."}
      >
        {isOwnProfile && (
          <Button
            type="button"
            variant="secondary"
            size="default"
            className="gap-2"
            data-cy="profile-replies-empty-create-post"
            onClick={handleCreatePostClick}
          >
            <Plus className="size-4" />
            <Typography as="span" overrideDefaults={true}>
              {'Create a Post'}
            </Typography>
          </Button>
        )}
      </IllustratedEmptyState>
      <DialogNewPost open={newPostOpen} onOpenChangeAction={setNewPostOpen} />
    </>
  );
}
