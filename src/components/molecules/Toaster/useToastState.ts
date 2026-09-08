'use client';

import { useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from './toast.store';

export function useToastState() {
  const { toasts } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    toasts,
    dismiss: (toastId: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}
