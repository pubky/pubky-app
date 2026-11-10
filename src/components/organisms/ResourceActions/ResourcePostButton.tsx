'use client';

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { PostActionButton, type PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';

/**
 * "Post about this", in the post's repost button: opens the new-post composer with the external
 * resource's link as its text. As the first link of a new post it is selected as the post's embed,
 * so the composer shows its card with the X that removes it. `count` is how many posts embed the link
 * (Nexus' `embeds_count`); none shows while it is read or not counted. Signed out, it asks to sign
 * in. Without a web link (`null`: a resource known only as `isbn:`, `doi:`, ...) it is disabled, as
 * the composer embeds web links only.
 * `surface` is what the row sits on (`muted` on a card in a post).
 */
export function ResourcePostButton({
  uri,
  count,
  surface = 'muted',
}: {
  uri: string | null;
  count?: number;
  surface?: PostActionSurface;
}) {
  const { requireAuth } = useRequireAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PostActionButton
        icon={Repeat}
        surface={surface}
        count={count}
        ariaLabel={
          count === undefined
            ? 'Post about this'
            : `Post about this (${count} ${count === 1 ? 'post embeds' : 'posts embed'} it)`
        }
        title="Post about this"
        disabled={!uri}
        onClick={() => requireAuth(() => setOpen(true))}
        data-testid="resource-post-button"
      />
      {open && uri && <DialogNewPost open={open} onOpenChangeAction={setOpen} initialContent={uri} />}
    </>
  );
}
