'use client';

import { useEffect, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { cn } from '@/libs/utils/utils';
import { POST_LINK_LONG_PRESS_DELAY_MS } from './PostText.constants';
import type { RemarkAnchorProps } from './PostText.types';
import { getCompactUrlText } from './PostText.utils';

interface PostTextLinkProps extends RemarkAnchorProps {
  compactUrl?: boolean;
  onLinkClick?: (url: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
}

const TOUCH_MOVE_TOLERANCE_PX = 10;

export function PostTextLink({
  children,
  className,
  compactUrl = true,
  onLinkClick,
  node: _node,
  ref: _ref,
  ...rest
}: PostTextLinkProps) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchInteractionRef = useRef(false);
  const shouldSuppressClickRef = useRef(false);
  const displayText = typeof children === 'string' ? children : null;
  const compactUrlText = compactUrl && displayText ? getCompactUrlText(displayText, rest.href) : null;

  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const resetTouchInteraction = () => {
    touchStartRef.current = null;
    isTouchInteractionRef.current = false;
    shouldSuppressClickRef.current = false;
  };

  const link = (
    <a
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compactUrlText ? displayText || undefined : rest['aria-label']}
      style={compactUrlText ? { ...rest.style, WebkitTouchCallout: 'none' } : rest.style}
      onPointerDown={(event) => {
        if (!compactUrlText || event.pointerType !== 'touch') {
          clearLongPressTimer();
          resetTouchInteraction();
          return;
        }

        clearLongPressTimer();
        isTouchInteractionRef.current = true;
        shouldSuppressClickRef.current = false;
        touchStartRef.current = { x: event.clientX, y: event.clientY };
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          shouldSuppressClickRef.current = true;
          setIsTooltipOpen(true);
        }, POST_LINK_LONG_PRESS_DELAY_MS);
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch' || !touchStartRef.current) return;

        const movedX = Math.abs(event.clientX - touchStartRef.current.x);
        const movedY = Math.abs(event.clientY - touchStartRef.current.y);

        if (movedX > TOUCH_MOVE_TOLERANCE_PX || movedY > TOUCH_MOVE_TOLERANCE_PX) {
          clearLongPressTimer();
          touchStartRef.current = null;
          shouldSuppressClickRef.current = true;
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch' || !touchStartRef.current) return;

        clearLongPressTimer();
        touchStartRef.current = null;
        shouldSuppressClickRef.current = true;
      }}
      onPointerUp={() => {
        clearLongPressTimer();
        touchStartRef.current = null;
      }}
      onPointerCancel={() => {
        clearLongPressTimer();
        resetTouchInteraction();
        setIsTooltipOpen(false);
      }}
      onContextMenu={(event) => {
        if (isTouchInteractionRef.current) event.preventDefault();
      }}
      onClick={(event) => {
        event.stopPropagation();

        if (shouldSuppressClickRef.current) {
          event.preventDefault();
          resetTouchInteraction();
          return;
        }

        resetTouchInteraction();
        setIsTooltipOpen(false);

        if (onLinkClick && rest.href) {
          onLinkClick(rest.href, event);
        }
      }}
      className={cn(className, 'inline cursor-pointer text-brand transition-colors hover:text-brand/80')}
    >
      {compactUrlText || children}
    </a>
  );

  if (!compactUrlText || !displayText) return link;

  return (
    <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="bg-accent font-medium wrap-anywhere text-foreground [&_svg]:fill-accent">
          {displayText}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
