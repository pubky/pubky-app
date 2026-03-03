import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import * as Libs from '@/libs';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" data-testid="dialog" {...props} />;
}

function DialogTrigger({ asChild, ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      data-testid="dialog-trigger"
      data-as-child={asChild ? 'true' : 'false'}
      asChild={asChild}
      {...props}
    />
  );
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

const DialogClose = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Close>,
  React.ComponentProps<typeof DialogPrimitive.Close>
>(({ ...props }, ref) => {
  return <DialogPrimitive.Close ref={ref} data-slot="dialog-close" data-testid="dialog-close" {...props} />;
});
DialogClose.displayName = 'DialogClose';

function DialogOverlay({
  className,
  onCloseRef,
  contentRef,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  onCloseRef?: React.RefObject<HTMLButtonElement | null>;
  contentRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      onClick={(e) => {
        // Skip closing the dialog if a Select inside this dialog is currently open,
        // otherwise the dismiss click propagates through and closes the parent dialog.
        // We check the trigger (not the portaled dropdown) because it stays in the
        // dialog DOM and Radix sets data-state="open" on it when the dropdown is visible.
        // This must run before stopPropagation so the event still reaches
        // the Select's own dismiss listener and closes the dropdown.
        const hasOpenSelect = contentRef?.current?.querySelector('[data-slot="select-trigger"][data-state="open"]');
        if (hasOpenSelect) return;
        e.stopPropagation();
        onCloseRef?.current?.click();
      }}
      className={Libs.cn(
        'fixed inset-0 z-40 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  hiddenTitle,
  overrideDefaults = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  hiddenTitle?: string;
  overrideDefaults?: boolean;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay onCloseRef={closeRef} contentRef={contentRef} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          data-cy="dialog-content"
          data-slot="dialog-content"
          data-testid="dialog-content"
          className={Libs.cn(
            'relative z-50 grid',
            'duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'm-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            overrideDefaults
              ? ''
              : 'max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg sm:rounded-xl sm:p-8',
            className,
          )}
          {...props}
        >
          {hiddenTitle && <DialogPrimitive.Title className="sr-only">{hiddenTitle}</DialogPrimitive.Title>}
          {children}
          <DialogClose
            ref={closeRef}
            className={Libs.cn(
              showCloseButton
                ? 'absolute top-4 right-4 cursor-pointer rounded-full bg-secondary p-2 transition-all duration-300 ease-in-out outline-none hover:bg-secondary/80 focus:outline-none disabled:pointer-events-none disabled:opacity-50'
                : 'hidden',
            )}
          >
            <Libs.X className="h-4 w-4 text-secondary-foreground opacity-70" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      data-testid="dialog-header"
      className={Libs.cn('flex flex-col gap-1.5 pr-6', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={Libs.cn(
        'flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-4 md:justify-between [&>*]:w-full sm:[&>*]:flex-1',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      data-testid="dialog-title"
      className={Libs.cn('text-xl/[1.4] font-bold text-foreground sm:text-2xl/[1.333]', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={Libs.cn('text-sm leading-normal font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
