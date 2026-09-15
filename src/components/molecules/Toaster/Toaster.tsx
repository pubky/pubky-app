'use client';
import { Toast, ToastAction, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/atoms/Toast/Toast';
import { TOAST_ICONS, toastIconVariants } from '@/atoms/Toast/Toast.variants';
import { useToastState } from './useToastState';

export function Toaster() {
  const { toasts, dismiss } = useToastState();
  return (
    // The store owns auto-dismiss (see toast.store.ts); duration={Infinity} disarms
    // Radix's own 5s close timer so it can never race the store's.
    <ToastProvider duration={Infinity}>
      {toasts.map(({ id, title, description, action, dismissButton, variant, open }) => {
        const Icon = TOAST_ICONS[variant];
        // `||`, not `??`: an empty title (e.g. an Error with no message) still gets the fallback
        const effectiveTitle = title || (variant === 'error' ? 'Error' : undefined);

        return (
          <Toast
            key={id}
            variant={variant}
            data-cy="toast"
            open={open}
            onOpenChange={(isOpen) => {
              if (!isOpen) dismiss(id);
            }}
          >
            <Icon className={toastIconVariants({ variant })} aria-hidden />
            <div className="flex max-h-32 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 overflow-y-auto overscroll-y-contain">
              {effectiveTitle && <ToastTitle>{effectiveTitle}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action && (
                <ToastAction
                  altText={action.altText}
                  variant="muted"
                  onClick={() => {
                    dismiss(id);
                    action.onClick();
                  }}
                >
                  {action.label}
                </ToastAction>
              )}
              {dismissButton && (
                <ToastAction
                  altText={'OK'}
                  variant={variant === 'default' ? 'brand' : 'muted'}
                  onClick={() => dismiss(id)}
                >
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
