import { cva } from 'class-variance-authority';
import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { ToastErrorIcon, ToastInfoIcon, ToastSuccessIcon, ToastWarningIcon } from './Toast.icons';

export type ToastVariant = 'default' | 'error' | 'warning' | 'info';
export type ToastIconComponent = ComponentType<LucideProps>;

export const toastVariants = cva(
  [
    'group pointer-events-auto relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border p-6 shadow-lg backdrop-blur-[10px] transition-all',
    'data-[swipe=cancel]:translate-x-0',
    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
    'data-[swipe=move]:transition-none',
    'data-[state=open]:animate-in',
    'data-[state=closed]:animate-out',
    'data-[swipe=end]:animate-out',
    'data-[state=closed]:fade-out-80',
    'data-[state=closed]:slide-out-to-bottom-full',
    'data-[state=open]:slide-in-from-bottom-full',
    'data-[state=open]:sm:slide-in-from-bottom-full',
  ],
  {
    variants: {
      variant: {
        default: 'border-brand/32 bg-brand/8',
        error: 'border-destructive/32 bg-destructive/8',
        warning: 'border-yellow-500/32 bg-yellow-500/8',
        info: 'border-accent/32 bg-accent/8',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export const toastIconVariants = cva('size-5 shrink-0', {
  variants: {
    variant: {
      default: 'text-brand',
      error: 'text-destructive',
      warning: 'text-yellow-500',
      info: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

// Action buttons carry an emphasis, not a toast semantic: brand matches Button
// variant="default" color classes, muted is the low-emphasis style used everywhere else.
export const toastActionVariants = cva(
  'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full border px-3 text-xs font-bold  transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        brand: 'shadow-xs border-brand bg-brand/16 text-brand hover:!bg-brand/30',
        muted: 'shadow-xs bg-toast-action-muted text-foreground hover:border-toast-action-muted-hover-border',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  },
);

export const TOAST_ICONS: Record<ToastVariant, ToastIconComponent> = {
  default: ToastSuccessIcon,
  error: ToastErrorIcon,
  warning: ToastWarningIcon,
  info: ToastInfoIcon,
};
