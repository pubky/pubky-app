'use client';

import { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock/useBodyScrollLock';

/**
 * Viewport-sized overlay mode for a canvas card.
 *
 * A CSS overlay rather than the Fullscreen API: layers portaled to body
 * (popovers, dialogs, toasts) stay visible, and it works on iPhone.
 * `onToggled` fires two frames after each toggle, once the wrapper has
 * resized and the canvas has re-rendered at the new size, so callers can
 * refit the camera.
 */
export function useFullscreenToggle(onToggled?: () => void) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const onToggledRef = useRef(onToggled);
  const reportedRef = useRef(isFullscreen);

  useEffect(() => {
    onToggledRef.current = onToggled;
  }, [onToggled]);

  useBodyScrollLock(isFullscreen);

  const toggleFullscreen = () => setIsFullscreen((on) => !on);

  // Escape exits, unless a popover or dialog layer already consumed the key
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (reportedRef.current === isFullscreen) return;
    reportedRef.current = isFullscreen;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => onToggledRef.current?.());
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  return { isFullscreen, toggleFullscreen };
}
