import { cva } from 'class-variance-authority';

/** Trigger styling shared by the action buttons and the save picker they sit beside. */
export const postActionsButtonVariants = cva('', {
  variants: {
    variant: {
      default: 'border-none shadow-xs',
      visual: 'border-white/10 bg-black/40 text-white shadow-none hover:border-white/30 hover:bg-black/70',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

/** Count styling next to every action icon (tag / reply / repost / collections). */
export const postActionsCountVariants = cva('text-xs leading-4 font-bold', {
  variants: {
    variant: {
      default: 'text-muted-foreground',
      visual: 'text-white/80',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
