'use client';

import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { Toast as ToastPrimitives } from 'radix-ui';
import { cn } from '@/libs/utils/utils';
import { toastActionVariants, toastVariants } from './Toast.variants';

const ToastProvider = ToastPrimitives.Provider;
const ToastViewport = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-16 left-1/2 z-[100] flex max-h-screen w-full -translate-x-1/2 flex-col-reverse p-4 sm:bottom-8 sm:max-w-[550px]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const Toast = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant = 'default', ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      data-variant={variant}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action> & VariantProps<typeof toastActionVariants>
>(({ className, variant = 'muted', ...props }, ref) => (
  <ToastPrimitives.Action ref={ref} className={cn(toastActionVariants({ variant }), className)} {...props} />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastTitle = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('min-w-0 text-sm leading-normal font-bold break-words text-popover-foreground', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('min-w-0 text-sm wrap-anywhere text-muted-foreground', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

export { Toast, ToastAction, ToastDescription, ToastProvider, ToastTitle, ToastViewport };
