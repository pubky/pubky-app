'use client';

import { useState } from 'react';
import * as Atoms from '@/atoms';
import { POPOVER_ALIGN_OFFSET, POPOVER_HOVER_DELAY, POPOVER_SIDE_OFFSET } from './UserInfoPopover.constants';
import { UserInfoPopoverContent } from './components/UserInfoPopoverContent/UserInfoPopoverContent';

interface UserInfoPopoverProps {
  userId: string;
  userName: string;
  avatarUrl?: string;
  formattedPublicKey: string;
  children: React.ReactNode;
  /** Enable hover trigger. Defaults to true (hover-to-open). Set false for click-to-open. */
  hover?: boolean;
  /** Vertical offset from trigger element. Defaults to POPOVER_SIDE_OFFSET (1). */
  sideOffset?: number;
  /** Horizontal alignment offset. Defaults to POPOVER_ALIGN_OFFSET (-24). */
  alignOffset?: number;
}

/**
 * Wrapper component for user info popover.
 *
 * Performance optimization: We use `open` state to conditionally render the content
 * only when the popover is actually visible. This prevents loading all hooks and
 * data fetching for every user on the timeline.
 */
export function UserInfoPopover({
  userId,
  userName,
  avatarUrl,
  formattedPublicKey,
  children,
  hover = true,
  sideOffset = POPOVER_SIDE_OFFSET,
  alignOffset = POPOVER_ALIGN_OFFSET,
}: UserInfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Atoms.Popover hover={hover} hoverDelay={POPOVER_HOVER_DELAY} open={open} onOpenChange={setOpen}>
      <Atoms.PopoverTrigger asChild>{children}</Atoms.PopoverTrigger>
      <Atoms.PopoverContent
        side="top"
        sideOffset={sideOffset}
        align="start"
        alignOffset={alignOffset}
        className="mx-0 w-(--popover-width)"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {open ? (
          <UserInfoPopoverContent
            userId={userId}
            userName={userName}
            avatarUrl={avatarUrl}
            formattedPublicKey={formattedPublicKey}
          />
        ) : null}
      </Atoms.PopoverContent>
    </Atoms.Popover>
  );
}
