'use client';

import { GLASS_PANEL_CLASS } from '@/config/theme';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { CanvasAnchoredPopover } from '@/molecules/CanvasAnchoredPopover/CanvasAnchoredPopover';
import { UserInfoPopoverContent } from '@/molecules/UserInfoPopover/components/UserInfoPopoverContent/UserInfoPopoverContent';

export interface ProfileHoverCardProps {
  pubky: Pubky;
  /** Display name when the caller already has one (falls back to the key) */
  userName?: string;
  /** Early avatar fallback while the reactive profile loads */
  avatarUrl?: string;
  /** Controlled visibility; hover intent lives in the caller */
  open: boolean;
  /** Anchor point relative to the positioned container; the caller feeds
   * fresh coordinates per frame so the card tracks the node */
  x: number;
  y: number;
  /** Keeps the card alive while the pointer is over it */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  className?: string;
}

/**
 * ProfileHoverCard
 *
 * Hover-intent profile preview for the graph canvas: the shared
 * UserInfoPopoverContent (reactive bio, counts, follow button, profile
 * links) riding the canvas-anchored positioner, so it spawns fully visible
 * next to the hovered node and follows it through pan, zoom, and drags.
 */
export function ProfileHoverCard({
  pubky,
  userName,
  avatarUrl,
  open,
  x,
  y,
  onPointerEnter,
  onPointerLeave,
  className,
}: ProfileHoverCardProps) {
  if (!open) return null;
  return (
    <CanvasAnchoredPopover
      x={x}
      y={y}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(GLASS_PANEL_CLASS, 'w-72 bg-black/70 p-4 shadow-lg', className)}
      data-cy="graph-hover-card"
    >
      <UserInfoPopoverContent
        userId={pubky}
        userName={userName || formatPublicKey({ key: pubky })}
        avatarUrl={avatarUrl}
        formattedPublicKey={formatPublicKey({ key: pubky })}
      />
    </CanvasAnchoredPopover>
  );
}
