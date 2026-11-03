'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredTagSuggestion } from '@/application/pubchi/pubchi.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { toast } from '@/molecules/Toaster/toast';

function invalidateGeneration(generation: { current: number }, token: number) {
  if (generation.current === token) generation.current = token + 1;
}

export function useDiscoveredTagSuggestions(
  owner: string | null | undefined,
  targetUri: string | undefined,
  open: boolean,
  liveRecordId?: string,
) {
  const generation = useRef(0);
  const cache = useRef(new Map<string, DiscoveredTagSuggestion[]>());
  const wasOpen = useRef(false);
  const [suggestions, setSuggestions] = useState<DiscoveredTagSuggestion[]>([]);

  useEffect(() => {
    const token = ++generation.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && generation.current === token;
    if (open && !wasOpen.current) cache.current.clear();
    wasOpen.current = open;
    if (!open || !owner || !targetUri || !isPubchiEnabled()) {
      setSuggestions([]);
      return;
    }
    const key = `${owner}\n${targetUri}\n${liveRecordId ?? ''}`;
    const cached = cache.current.get(key);
    if (cached) {
      setSuggestions(cached);
      return;
    }
    void PubchiController.discoverTagSuggestions(targetUri, isCurrent, liveRecordId)
      .then((next) => {
        if (!isCurrent()) return;
        cache.current.set(key, next);
        setSuggestions(next);
      })
      .catch(() => {
        if (isCurrent()) setSuggestions([]);
      });
    return () => {
      cancelled = true;
      invalidateGeneration(generation, token);
    };
  }, [liveRecordId, open, owner, targetUri]);

  const update = (next: DiscoveredTagSuggestion) => {
    if (!owner || !targetUri) return;
    const values = suggestions.map((suggestion) =>
      suggestion.applicationId === next.applicationId ? next : suggestion,
    );
    cache.current.set(`${owner}\n${targetUri}\n${liveRecordId ?? ''}`, values);
    setSuggestions(values);
  };

  const reconcile = async (applicationId: string) => {
    if (!open || !owner || !targetUri) return;
    const token = generation.current;
    const isCurrent = () => generation.current === token;
    try {
      const next = await PubchiController.reconcileDiscoveredTagSuggestion(targetUri, applicationId, isCurrent);
      if (isCurrent() && next) update(next);
    } catch {
      if (isCurrent()) toast({ variant: 'error', description: 'Could not check this tag. Try again.' });
    }
  };

  const revert = async (applicationId: string) => {
    if (!open || !owner || !targetUri) return;
    const token = generation.current;
    const isCurrent = () => generation.current === token;
    try {
      const next = await PubchiController.revertDiscoveredTagSuggestion(targetUri, applicationId, isCurrent);
      if (isCurrent() && next) update(next);
    } catch {
      if (isCurrent()) toast({ variant: 'error', description: 'Could not remove this tag. Try again.' });
    }
  };

  return { suggestions, revert, reconcile };
}
