'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as Libs from '@/libs';
import { X } from 'lucide-react';
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close asChild>
    <DialogPrimitive.Overlay
      className={Libs.cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
      ref={ref}
    />
  </DialogPrimitive.Close>
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;
interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'top' | 'right' | 'bottom' | 'left';
}
const SheetContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ side = 'right', className, children, ...props }, ref) => {
    const sideClasses = {
      top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
      bottom:
        'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
      left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
      right:
        'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
    };
    return (
      <SheetPortal>
        <SheetOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={Libs.cn(
            'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
            sideClasses[side],
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = DialogPrimitive.Content.displayName;
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={Libs.cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';
const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={Libs.cn('text-lg font-semibold text-foreground', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;
const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={Libs.cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;
export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription };
