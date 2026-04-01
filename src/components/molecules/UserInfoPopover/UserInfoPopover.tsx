'use client';

import { useEffect, useRef, useState } from 'react';
import * as Atoms from '@/atoms';
import {
  DEFAULT_STABLE_POPOVER_VIEWPORT_PADDING,
  POPOVER_ALIGN_OFFSET,
  POPOVER_HOVER_DELAY,
  POPOVER_SIDE_OFFSET,
  STABLE_POPOVER_CLOSE_RENDER_TIMEOUT,
  STABLE_POPOVER_ESTIMATED_HEIGHT,
} from './UserInfoPopover.constants';
import { chooseStableVerticalSide, type StableVerticalPopoverSide } from './UserInfoPopover.utils';
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
  /** Preferred vertical side for the popover. Defaults to top. */
  preferredSide?: StableVerticalPopoverSide;
  /** Optional stable-placement config. When omitted, Radix collision handling is used. */
  stablePlacement?: {
    triggerRef: React.RefObject<HTMLElement | null>;
    viewportPadding?: {
      top: number;
      bottom: number;
    };
  };
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
  preferredSide = 'top',
  stablePlacement,
}: UserInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [resolvedSide, setResolvedSide] = useState<StableVerticalPopoverSide>(preferredSide);
  const measuredHeightRef = useRef(STABLE_POPOVER_ESTIMATED_HEIGHT);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStablePlacement = Boolean(stablePlacement);
  const triggerRef = stablePlacement?.triggerRef;
  const viewportPadding = stablePlacement?.viewportPadding ?? DEFAULT_STABLE_POPOVER_VIEWPORT_PADDING;

  const clearCloseRenderTimeout = () => {
    if (closeRenderTimeoutRef.current) {
      clearTimeout(closeRenderTimeoutRef.current);
      closeRenderTimeoutRef.current = null;
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && isStablePlacement) {
      clearCloseRenderTimeout();
      setIsClosing(false);
      const triggerElement = triggerRef?.current;

      if (triggerElement) {
        setResolvedSide(
          chooseStableVerticalSide({
            triggerRect: triggerElement.getBoundingClientRect(),
            estimatedPopoverHeight: measuredHeightRef.current,
            preferredSide,
            sideOffset,
            viewportPaddingTop: viewportPadding.top,
            viewportPaddingBottom: viewportPadding.bottom,
            viewportHeight: window.innerHeight,
          }),
        );
      } else {
        setResolvedSide(preferredSide);
      }
    } else if (!nextOpen && open && isStablePlacement) {
      clearCloseRenderTimeout();
      setIsClosing(true);
      closeRenderTimeoutRef.current = setTimeout(() => {
        setIsClosing(false);
        closeRenderTimeoutRef.current = null;
      }, STABLE_POPOVER_CLOSE_RENDER_TIMEOUT);
    }

    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open || !isStablePlacement || !contentRef.current) {
      return;
    }

    const updateMeasuredHeight = () => {
      const contentHeight = Math.ceil(contentRef.current?.getBoundingClientRect().height ?? 0);
      if (contentHeight > 0) {
        measuredHeightRef.current = contentHeight;
      }
    };

    updateMeasuredHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateMeasuredHeight();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isStablePlacement, open]);

  useEffect(() => {
    return () => {
      clearCloseRenderTimeout();
    };
  }, []);

  const handleContentAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      return;
    }

    if (e.currentTarget.getAttribute('data-state') === 'closed') {
      clearCloseRenderTimeout();
      setIsClosing(false);
    }
  };

  const shouldRenderContent = open || (isStablePlacement && isClosing);

  return (
    <Atoms.Popover hover={hover} hoverDelay={POPOVER_HOVER_DELAY} open={open} onOpenChange={handleOpenChange}>
      <Atoms.PopoverTrigger asChild>{children}</Atoms.PopoverTrigger>
      <Atoms.PopoverContent
        ref={contentRef}
        side={isStablePlacement ? resolvedSide : preferredSide}
        sideOffset={sideOffset}
        align="start"
        alignOffset={alignOffset}
        avoidCollisions={isStablePlacement ? false : undefined}
        className="mx-0 w-(--popover-width)"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onAnimationEnd={handleContentAnimationEnd}
      >
        {shouldRenderContent ? (
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
