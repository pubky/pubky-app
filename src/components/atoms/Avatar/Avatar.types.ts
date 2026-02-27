import * as React from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { type VariantProps } from 'class-variance-authority';
import { avatarVariants } from './Avatar.variants';

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>, VariantProps<typeof avatarVariants> {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}

export interface AvatarImageProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> {
  className?: React.HTMLAttributes<HTMLImageElement>['className'];
}

export interface AvatarFallbackProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
