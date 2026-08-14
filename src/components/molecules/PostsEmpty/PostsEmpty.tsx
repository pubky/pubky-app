'use client';

import { useState } from 'react';
import { File, Plus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function PostsEmpty() {
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
        imageAlt={'Posts - Empty state'}
        icon={File}
        title={'No posts yet'}
        subtitle={isOwnProfile ? "What's on your mind?" : "This user hasn't posted yet."}
      >
        {isOwnProfile && (
          <Button
            type="button"
            variant="default"
            size="default"
            className="gap-2"
            data-cy="profile-posts-empty-create-post"
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
