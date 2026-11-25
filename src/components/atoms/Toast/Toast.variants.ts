import { cva } from 'class-variance-authority';
import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { buttonVariants } from '@/atoms/Button/Button';
import { ToastErrorIcon, ToastInfoIcon, ToastSuccessIcon, ToastWarningIcon } from './Toast.icons';

export type ToastVariant = 'default' | 'error' | 'warning' | 'info';
export type ToastIconComponent = ComponentType<LucideProps>;

export const toastVariants = cva(
  [
    'group/toast pointer-events-auto relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md border p-6 shadow-lg backdrop-blur-[10px] transition-all',
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
        default: 'border-brand/50 bg-toast-success',
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

// Radix moves focus programmatically when tabbing through a toast. Style :focus for that WebKit path.
export const toastActionVariants = cva('', {
  variants: {
    variant: {
      // The tinted toast needs a stronger dark focus ring and the hover wash to keep OK readable.
      brand: [
        buttonVariants({ variant: 'default', size: 'sm' }),
        'px-3.5 text-xs light:text-brand-foreground focus:bg-brand/32 focus:ring-[3px] focus:ring-ring dark:focus:bg-button-hover dark:focus:ring-primary forced-colors:focus:outline-2 forced-colors:focus:outline-solid',
      ],
      muted:
        'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-toast-action-muted px-3 text-xs font-bold text-foreground shadow-xs transition-all hover:border-toast-action-muted-hover-border focus:-outline-offset-2 focus:outline-2 focus:outline-foreground disabled:pointer-events-none disabled:opacity-50',
    },
  },
  defaultVariants: {
    variant: 'muted',
  },
});

export const TOAST_ICONS: Record<ToastVariant, ToastIconComponent> = {
  default: ToastSuccessIcon,
  error: ToastErrorIcon,
  warning: ToastWarningIcon,
  info: ToastInfoIcon,
};
