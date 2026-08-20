'use client';

import type { ToastVariant } from '@/atoms/Toast/Toast.variants';
import { dispatch, genId } from './toast.store';

export interface ToastActionDescriptor {
  label: string;
  altText: string;
  onClick: () => void;
}

export interface ToastHandle {
  dismiss: () => void;
}

interface ToastOptionsBase {
  variant?: ToastVariant;
  dismissButton?: boolean;
  action?: ToastActionDescriptor;
}

export type ToastOptions = ToastOptionsBase &
  ({ title: string; description?: string } | { title?: string; description: string });

export function toast(options: ToastOptions): ToastHandle {
  const id = genId();

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      id,
      variant: options.variant ?? 'default',
      title: options.title,
      description: options.description,
      dismissButton: options.dismissButton ?? false,
      action: options.action,
      open: true,
    },
  });

  return { dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }) };
}
