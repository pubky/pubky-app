'use client';

import type { ToastVariant } from '@/atoms/Toast/Toast.variants';
import type { ToastActionDescriptor } from './toast';

// Max number of transient toasts visible at once. Persistent toasts (see `persistent` in
// toast.ts) are exempt: they stack next to the transient one until acted on or dismissed.
const TOAST_LIMIT = 1;
// Delay before removing a dismissed toast from React state (after visual dismiss)
export const TOAST_REMOVE_DELAY = 20_000;
// How long a toast stays visible before auto-dismissing
export const TOAST_DURATION = 3_000;

interface ToasterToast {
  id: string;
  variant: ToastVariant;
  title?: string;
  description?: string;
  dismissButton: boolean;
  action?: ToastActionDescriptor;
  persistent: boolean;
  open: boolean;
}

interface State {
  toasts: ToasterToast[];
}

type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'DISMISS_TOAST'; toastId: string }
  | { type: 'REMOVE_TOAST'; toastId: string };

let count = 0;

export function genId() {
  count += 1;
  return String(count);
}

// Pending timers per toast id. Cleared when the toast leaves state early
// (transient limit eviction, manual dismiss) so no timer ever fires for an absent toast.
const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const clearToastTimers = (toastId: string) => {
  const dismissTimeout = dismissTimeouts.get(toastId);
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeouts.delete(toastId);
  }
  const removeTimeout = removeTimeouts.get(toastId);
  if (removeTimeout) {
    clearTimeout(removeTimeout);
    removeTimeouts.delete(toastId);
  }
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST': {
      // Persistent toasts hold state the user must resolve, so they never count toward the
      // limit and are never evicted by it; only transient toasts compete for TOAST_LIMIT.
      const toasts = [action.toast, ...state.toasts];
      const keptTransient = toasts.filter((t) => !t.persistent).slice(0, TOAST_LIMIT);
      return {
        ...state,
        toasts: toasts.filter((t) => t.persistent || keptTransient.includes(t)),
      };
    }

    case 'DISMISS_TOAST':
      if (!state.toasts.some((t) => t.id === action.toastId && t.open)) return state;
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toastId ? { ...t, open: false } : t)),
      };

    case 'REMOVE_TOAST':
      if (!state.toasts.some((t) => t.id === action.toastId)) return state;
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = new Set<() => void>();

let memoryState: State = { toasts: [] };

export function dispatch(action: Action) {
  const previous = memoryState;
  const next = reducer(previous, action);
  // A no-op action (dismissing an already-dismissed or absent toast) must not
  // schedule timers or re-render subscribers.
  if (next === previous) return;
  memoryState = next;

  // Timers are scheduled here rather than in the reducer so the reducer stays pure.
  switch (action.type) {
    case 'ADD_TOAST': {
      const { id, persistent } = action.toast;
      // Radix Toast's internal timer fails to start when isClosePausedRef stays true
      // after user interaction (e.g. clicking a button inside a toast), which left the
      // delete success toast stuck open in the repost → undo flow. Known unresolved bug:
      // https://github.com/radix-ui/primitives/issues/2233
      // The store therefore owns auto-dismiss, and the Toaster disarms Radix's own
      // timer with duration={Infinity}. A persistent toast gets no timer at all: it
      // leaves only through its action, the dismiss button, or a swipe.
      if (!persistent) {
        dismissTimeouts.set(
          id,
          setTimeout(() => {
            dismissTimeouts.delete(id);
            dispatch({ type: 'DISMISS_TOAST', toastId: id });
          }, TOAST_DURATION),
        );
      }
      for (const evicted of previous.toasts) {
        if (!next.toasts.includes(evicted)) clearToastTimers(evicted.id);
      }
      break;
    }

    case 'DISMISS_TOAST': {
      const dismissTimeout = dismissTimeouts.get(action.toastId);
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        dismissTimeouts.delete(action.toastId);
      }
      removeTimeouts.set(
        action.toastId,
        setTimeout(() => {
          removeTimeouts.delete(action.toastId);
          dispatch({ type: 'REMOVE_TOAST', toastId: action.toastId });
        }, TOAST_REMOVE_DELAY),
      );
      break;
    }

    case 'REMOVE_TOAST':
      break;
  }

  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): State {
  return memoryState;
}
