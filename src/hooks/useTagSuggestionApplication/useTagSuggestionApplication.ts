'use client';

import { useEffect, useState } from 'react';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { isPubchiEnabled } from '@/libs/pubchi/flags';

export function useTagSuggestionApplication(recordId?: string, visible = true) {
  const [statuses, setStatuses] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    if (!visible || !recordId || !isPubchiEnabled()) {
      setStatuses({});
      return;
    }
    void PubchiController.getTagSuggestionStatuses(recordId).then(async (stored) => {
      if (!active) return;
      setStatuses(stored);
      for (const [key, status] of Object.entries(stored)) {
        if (status !== 'applying' && status !== 'reconciliation-pending') continue;
        const index = Number(key);
        setStatuses((current) => ({ ...current, [index]: 'reconciling' }));
        const reconciled = await PubchiController.reconcileTagSuggestion(recordId, index);
        if (active) setStatuses((current) => ({ ...current, [index]: reconciled }));
      }
    });
    return () => {
      active = false;
    };
  }, [recordId, visible]);

  const approve = async (index: number) => {
    if (!recordId) {
      setStatuses((current) => ({ ...current, [index]: 'failed' }));
      return;
    }
    setStatuses((current) => ({ ...current, [index]: 'applying' }));
    try {
      const status = await PubchiController.applyTagSuggestion(recordId, index);
      setStatuses((current) => ({ ...current, [index]: status }));
    } catch {
      const stored = await PubchiController.getTagSuggestionStatuses(recordId);
      setStatuses((current) => ({ ...current, [index]: stored[index] ?? 'failed' }));
    }
  };

  const revert = async (index: number) => {
    if (!recordId) {
      setStatuses((current) => ({ ...current, [index]: 'reconciliation-pending' }));
      return;
    }
    setStatuses((current) => ({ ...current, [index]: 'reconciling' }));
    try {
      await PubchiController.revertTagSuggestion(recordId, index);
      setStatuses((current) => ({ ...current, [index]: 'reverted' }));
    } catch {
      setStatuses((current) => ({ ...current, [index]: 'reconciliation-pending' }));
    }
  };

  const reconcile = async (index: number) => {
    if (!recordId) return;
    setStatuses((current) => ({ ...current, [index]: 'reconciling' }));
    const status = await PubchiController.reconcileTagSuggestion(recordId, index);
    setStatuses((current) => ({ ...current, [index]: status }));
  };

  return { statuses, approve, revert, reconcile };
}
