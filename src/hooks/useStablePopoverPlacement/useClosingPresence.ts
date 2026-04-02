'use client';

import { useEffect, useRef, useState } from 'react';
import { STABLE_POPOVER_CLOSE_RENDER_TIMEOUT } from './useStablePopoverPlacement.constants';

interface UseClosingPresenceOptions {
  open: boolean;
  enabled: boolean;
  timeoutMs?: number;
}

interface UseClosingPresenceResult {
  shouldRender: boolean;
  beginOpening: () => void;
  beginClosing: () => void;
  onAnimationEnd: React.AnimationEventHandler<HTMLDivElement>;
}

export function useClosingPresence({
  open,
  enabled,
  timeoutMs = STABLE_POPOVER_CLOSE_RENDER_TIMEOUT,
}: UseClosingPresenceOptions): UseClosingPresenceResult {
  const [isClosing, setIsClosing] = useState(false);
  const closeRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseRenderTimeout = () => {
    if (closeRenderTimeoutRef.current) {
      clearTimeout(closeRenderTimeoutRef.current);
      closeRenderTimeoutRef.current = null;
    }
  };

  const beginOpening = () => {
    clearCloseRenderTimeout();
    setIsClosing(false);
  };

  const beginClosing = () => {
    if (!enabled) {
      return;
    }

    clearCloseRenderTimeout();
    setIsClosing(true);
    closeRenderTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      closeRenderTimeoutRef.current = null;
    }, timeoutMs);
  };

  const onAnimationEnd: React.AnimationEventHandler<HTMLDivElement> = (e) => {
    if (e.target !== e.currentTarget) {
      return;
    }

    if (e.currentTarget.getAttribute('data-state') === 'closed') {
      clearCloseRenderTimeout();
      setIsClosing(false);
    }
  };

  useEffect(() => {
    return () => {
      clearCloseRenderTimeout();
    };
  }, []);

  return {
    shouldRender: open || (enabled && isClosing),
    beginOpening,
    beginClosing,
    onAnimationEnd,
  };
}
