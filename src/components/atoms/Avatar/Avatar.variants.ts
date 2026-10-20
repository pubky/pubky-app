import { cva } from 'class-variance-authority';

export const avatarVariants = cva('relative flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      xs: 'h-4 w-4',
      sm: 'h-6 w-6',
      default: 'h-10 w-10',
      md: 'h-8 w-8',
      lg: 'h-12 w-12',
      xl: 'h-16 w-16',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export type AvatarSize = 'xs' | 'sm' | 'default' | 'md' | 'lg' | 'xl';
