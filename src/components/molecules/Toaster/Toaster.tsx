'use client';
import { Toast, ToastAction, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/atoms/Toast/Toast';
import { TOAST_ICONS, toastIconVariants } from '@/atoms/Toast/Toast.variants';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        dismissButton,
        actionVariant,
        variant,
        className,
        ...props
      }) {
        const toastVariant = variant ?? 'default';
        const effectiveActionVariant = actionVariant ?? toastVariant;
        const Icon = TOAST_ICONS[toastVariant];
        const effectiveTitle = title ?? (toastVariant === 'error' ? 'Error' : undefined);

        return (
          <Toast key={id} variant={toastVariant} data-cy="toast" className={className} {...props}>
            <Icon className={toastIconVariants({ variant: toastVariant })} aria-hidden />
            <div className="flex max-h-32 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 overflow-y-auto overscroll-y-contain">
              {effectiveTitle && <ToastTitle>{effectiveTitle}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action}
              {dismissButton && (
                <ToastAction altText={'OK'} variant={effectiveActionVariant} onClick={() => dismiss(id)}>
                  {'OK'}
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
