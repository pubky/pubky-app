'use client';

import { useTranslations } from 'next-intl';
import {
  Toast,
  TOAST_ICONS,
  ToastAction,
  ToastDescription,
  toastIconVariants,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/atoms/Toast/Toast';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const tCommon = useTranslations('common');
  const tToast = useTranslations('toast');

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, dismissButton, variant, ...props }) {
        const toastVariant = variant ?? 'default';
        const Icon = TOAST_ICONS[toastVariant];
        const effectiveTitle = title ?? (toastVariant === 'error' ? tToast('genericErrorTitle') : undefined);

        return (
          <Toast key={id} variant={toastVariant} data-cy="toast" {...props}>
            <Icon className={toastIconVariants({ variant: toastVariant })} aria-hidden />
            <div className="flex max-h-32 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-y-contain">
              {effectiveTitle && <ToastTitle>{effectiveTitle}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action}
              {dismissButton && (
                <ToastAction altText={tCommon('ok')} variant={toastVariant} onClick={() => dismiss(id)}>
                  {tCommon('ok')}
                </ToastAction>
              )}
            </div>
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
