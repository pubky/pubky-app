'use client';

import { useTranslations } from 'next-intl';
import { Toast, ToastAction, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/atoms';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const tCommon = useTranslations('common');

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, dismissButton, ...props }) {
        return (
          <Toast
            key={id}
            data-cy="toast"
            className="flex items-center justify-between gap-2 rounded-lg border border-brand/32 bg-brand/8 p-6 shadow-lg backdrop-blur-[10px]"
            {...props}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action}
              {dismissButton && (
                <ToastAction altText={tCommon('ok')} onClick={() => dismiss(id)}>
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
