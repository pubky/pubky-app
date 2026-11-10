'use client';

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { PostActionButton } from '@/organisms/PostActionsBar/PostActionButton';

/**
 * "Post about this", in the post's repost button: opens the new-post composer with the external
 * resource's link as its text. No count: Nexus does not count the posts that embed a link. Signed
 * out, it asks to sign in.
 */
export function ResourcePostButton({ uri }: { uri: string }) {
  const { requireAuth } = useRequireAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PostActionButton
        icon={Repeat}
        surface="muted"
        ariaLabel="Post about this"
        title="Post about this"
        onClick={() => requireAuth(() => setOpen(true))}
        data-testid="resource-post-button"
      />
      {open && <DialogNewPost open={open} onOpenChangeAction={setOpen} initialContent={uri} />}
    </>
  );
}
