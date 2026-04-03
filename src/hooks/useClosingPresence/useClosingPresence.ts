'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CLOSE_PRESENCE_TIMEOUT } from './useClosingPresence.constants';

interface UseClosingPresenceOptions {
  open: boolean;
  timeoutMs?: number;
}

interface UseClosingPresenceResult {
  shouldRender: boolean;
  beginOpening: () => void;
  beginClosing: () => void;
  onAnimationEnd: React.AnimationEventHandler<HTMLDivElement>;
}

/**
 * Keeps inner content mounted while an animated container finishes closing.
 *
 * This hook exists to prevent the "empty popover flash" bug on hover-out/close:
 * the outer Radix content stays mounted long enough to run its `data-state="closed"`
 * animation, but conditionally rendered children would normally unmount as soon as
 * `open` becomes `false`. That leaves a visible empty shell for a frame or two.
 *
 * Use `beginOpening` / `beginClosing` in the same transition that updates `open`,
 * render children while `shouldRender` is true, and attach `onAnimationEnd` to the
 * animated container so closing presence is cleared when the close animation ends.
 * A timeout fallback covers cases where `animationend` does not fire.
 */
export function useClosingPresence({
  open,
  timeoutMs = DEFAULT_CLOSE_PRESENCE_TIMEOUT,
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
    shouldRender: open || isClosing,
    beginOpening,
    beginClosing,
    onAnimationEnd,
  };
}
