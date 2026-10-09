'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/molecules/Toaster/toast';

export interface UseFullscreenReturn {
  /** True while the document is fullscreen, whether this hook or something else put it there. */
  isFullscreen: boolean;
  /** False where the Fullscreen API is missing (iOS Safari), so a caller can leave its control out. */
  isSupported: boolean;
  /** Enters document fullscreen, or leaves it when it is active. Failures surface as a toast. */
  toggle: () => Promise<void>;
}

/**
 * Browser fullscreen for the whole document.
 *
 * The document rather than one element on purpose: a Radix portal (the emoji picker, the insert
 * dialogs, toasts) renders on `document.body`, and an element in fullscreen sits in the top layer
 * above everything outside it, so fullscreening the composer alone would hide every dialog it opens.
 *
 * Fullscreen entered through this hook ends when the caller unmounts, so closing the dialog that
 * offered the control never leaves the page stuck in it.
 */
export function useFullscreen(): UseFullscreenReturn {
  // Both start false so the server render and the first client render agree; the effect reads the browser.
  const [isSupported, setIsSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const enteredHereRef = useRef(false);

  useEffect(() => {
    setIsSupported(Boolean(document.fullscreenEnabled));

    const handleChange = () => {
      // Boolean(): a browser without the API has no `fullscreenElement` at all, not a null one
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) enteredHereRef.current = false;
    };
    handleChange();
    document.addEventListener('fullscreenchange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      if (enteredHereRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
          // The surface that entered fullscreen is gone; nothing is left to tell
        });
      }
    };
  }, []);

  const toggle = async () => {
    const leaving = Boolean(document.fullscreenElement);
    try {
      if (leaving) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        enteredHereRef.current = true;
      }
    } catch {
      toast({
        variant: 'error',
        description: leaving ? 'Could not exit fullscreen.' : 'Could not enter fullscreen.',
      });
    }
  };

  return { isFullscreen, isSupported, toggle };
}
