'use client';

import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/atoms';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast
            key={id}
            data-cy="toast"
            className="flex items-center justify-between gap-2 rounded-lg border border-brand/32 bg-brand/8 p-6 shadow-lg backdrop-blur-[10px]"
            {...props}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription className="truncate">{description}</ToastDescription>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
