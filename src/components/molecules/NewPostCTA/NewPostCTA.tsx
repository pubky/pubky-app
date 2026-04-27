'use client';

import { useState } from 'react';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Organisms from '@/organisms';

/**
 * Floating Action Button (FAB) for creating new posts.
 *
 * Visibility rules:
 * - Shows for authenticated users (opens new post dialog)
 * - Shows for unauthenticated users on public routes (opens sign-in dialog)
 * - Hidden on landing page and other non-public routes for unauthenticated users
 *
 * Positioning:
 * - On small screens (sm), the button sits directly on top of the menu bar by design.
 * - 72px is the current height of the footer navigation bar.
 * - md breakpoint uses 80px for additional spacing.
 */
import { Plus } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
export function NewPostCTA() {
  const [open, setOpen] = useState(false);
  const { isFullyAuthenticated, isLoading } = Hooks.useAuthStatus();
  const { isPublicRoute } = Hooks.usePublicRoute();
  const { requireAuth } = Hooks.useRequireAuth();

  // Show FAB for authenticated users OR unauthenticated users on public routes
  const shouldShow = isFullyAuthenticated || isPublicRoute;
  if (isLoading || !shouldShow) {
    return null;
  }
  const buttonClasses = cn(
    'fixed right-3 bottom-[72px] sm:right-10 md:bottom-20 lg:bottom-6',
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
    <Atoms.Button
      data-cy="new-post-btn"
      overrideDefaults
      data-testid="new-post-cta"
      className={buttonClasses}
      aria-label="New post"
      onClick={!isFullyAuthenticated ? () => requireAuth(() => setOpen(true)) : undefined}
    >
      <Plus className="size-10 transition-colors group-hover:text-black" strokeWidth={0.8} />
    </Atoms.Button>
  );

  // Unauthenticated: button opens sign-in dialog via requireAuth
  if (!isFullyAuthenticated) {
    return button;
  }

  // Authenticated: wrap button with dialog
  return (
    <Atoms.Dialog open={open} onOpenChange={setOpen}>
      <Atoms.DialogTrigger asChild>{button}</Atoms.DialogTrigger>
      <Organisms.DialogNewPost open={open} onOpenChangeAction={setOpen} />
    </Atoms.Dialog>
  );
}
