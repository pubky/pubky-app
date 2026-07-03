'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { useFabAction } from '@/hooks/useFabAction/useFabAction';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { DialogNewCollection } from '@/organisms/Collections/DialogNewCollection/DialogNewCollection';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';

/**
 * Floating Action Button (FAB).
 *
 * The button is always a `+`; its behavior is context-aware via
 * [`useFabAction`](src/hooks/useFabAction/useFabAction.ts):
 * - `/collections`                      -> create a new collection
 * - `/collections/bookmarks`            -> create a post and bookmark it
 * - `/collections/[ownPubky]/[postId]`  -> create a post inside that collection
 * - everywhere else (incl. non-owned)   -> create a new post
 *
 * Visibility rules:
 * - Shows for authenticated users (opens the context dialog)
 * - Shows for unauthenticated users on public explore routes (opens sign-in)
 * - Hidden on landing page and other non-public routes for unauthenticated users
 *
 * Positioning:
 * - On small screens (sm), the button sits directly on top of the menu bar by design.
 * - `bottom-18` (72px) matches the height of the footer navigation bar.
 * - md breakpoint uses 80px (`bottom-20`) for additional spacing.
 */
export function Fab() {
  const [open, setOpen] = useState(false);
  const { isFullyAuthenticated, isLoading } = useAuthStatus();
  const { isPublicExploreRoute } = usePublicRoute();
  const { requireAuth } = useRequireAuth();
  const action = useFabAction();

  // Show FAB for authenticated users OR unauthenticated users on public explore routes
  const shouldShow = isFullyAuthenticated || isPublicExploreRoute;
  if (isLoading || !shouldShow) {
    return null;
  }
  const buttonClasses = cn(
    'fixed right-3 bottom-18 sm:right-10 md:bottom-20 lg:bottom-6',
    'size-20 rounded-full',
    'flex items-center justify-center',
    'bg-white/12 backdrop-blur-lg',
    'hover:bg-brand',
    'text-white',
    'shadow-xl transition-colors',
    'group cursor-pointer',
    'z-40',
  );
  const button = (
    <Button
      data-cy="new-post-btn"
      overrideDefaults
      data-testid="new-post-cta"
      className={buttonClasses}
      aria-label={action.ariaLabel}
      onClick={() => requireAuth(() => setOpen(true))}
    >
      <Plus className="size-10 transition-colors group-hover:text-black" strokeWidth={0.8} />
    </Button>
  );

  // Unauthenticated: button only opens the sign-in dialog via requireAuth
  if (!isFullyAuthenticated) {
    return button;
  }

  // Authenticated: render the button next to the context dialog it controls
  return (
    <>
      {button}
      {action.kind === 'createCollection' ? (
        <DialogNewCollection open={open} onOpenChange={setOpen} />
      ) : (
        <DialogNewPost open={open} onOpenChangeAction={setOpen} onPostCreated={action.onPostCreated} />
      )}
    </>
  );
}
