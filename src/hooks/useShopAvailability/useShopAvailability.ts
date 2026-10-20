'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ShopEmbedController } from '@/controllers/shop-embed/shop-embed';

/**
 * Monitor the Shop BFF without touching authentication. A loaded frame survives
 * transient failures: only three consecutive online probes, at least 10s apart,
 * replace it with the outage view. Initial load failures can fail fast. Offline
 * and hidden tabs pause polling; the first healthy retry after an outage recovers.
 */
export function useShopAvailability(onRecovery: () => void) {
  const [unavailable, setUnavailable] = useState(false);
  const loaded = useRef(false);
  const recover = useEffectEvent(onRecovery);

  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let wasUnavailable = false;
    let failures = 0;
    let nextCheckAt = 0;
    let pauseGeneration = 0;
    const isPaused = () => document.hidden || navigator.onLine === false;

    const schedule = (delay = 10_000) => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), delay);
    };

    const check = async () => {
      if (abort.signal.aborted || running || isPaused()) return;
      // Focus/online bursts must not consume the running frame's failure budget.
      if (loaded.current && failures > 0 && Date.now() < nextCheckAt) {
        schedule(nextCheckAt - Date.now());
        return;
      }
      clearTimeout(timer);
      running = true;
      const startedGeneration = pauseGeneration;
      let available = false;
      try {
        available = await ShopEmbedController.fetchAvailability(abort.signal);
      } catch {
        // The service reports unexpected transport failures. Keep the App session
        // intact and retry this read-only probe, including after a network outage.
      }
      running = false;
      if (abort.signal.aborted) return;
      if (isPaused()) return;
      // A response from before an offline/background interval is not evidence of
      // a continuous BFF outage, even if the browser has already resumed.
      if (startedGeneration !== pauseGeneration) {
        schedule();
        return;
      }
      if (available) {
        failures = 0;
        if (wasUnavailable) recover();
        wasUnavailable = false;
        setUnavailable(false);
      } else {
        failures += 1;
        if (!loaded.current || failures >= 3) {
          loaded.current = false;
          wasUnavailable = true;
          setUnavailable(true);
        }
      }
      nextCheckAt = Date.now() + 10_000;
      schedule();
    };
    const resume = () => void check();
    const pause = () => {
      clearTimeout(timer);
      failures = 0;
      pauseGeneration += 1;
    };
    const visibilityChanged = () => (document.hidden ? pause() : resume());
    void check();
    window.addEventListener('online', resume);
    window.addEventListener('offline', pause);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      abort.abort();
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pause);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  const markLoaded = () => {
    loaded.current = true;
  };
  return { unavailable, markLoaded };
}
