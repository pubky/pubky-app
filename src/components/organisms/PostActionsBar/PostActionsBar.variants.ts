import { cva } from 'class-variance-authority';

/**
 * Trigger styling shared by the action buttons and the save picker they sit beside. `surface` is
 * what the row sits on: a post's `bg-card` by default; `muted` is the embed surface (an external
 * resource card's or a quoted post's `bg-embed`) and fills the pill with `bg-card`, so it stands out
 * as much there.
 */
export const postActionsButtonVariants = cva('', {
  variants: {
    variant: {
      default: 'border-none bg-action-pill shadow-xs',
      visual: 'border-white/10 bg-black/40 text-white shadow-none hover:border-white/30 hover:bg-black/70',
    },
    surface: {
      default: '',
      muted: '',
    },
  },
  compoundVariants: [
    {
      variant: 'default',
      surface: 'muted',
      class: 'bg-card hover:bg-card/70',
    },
  ],
  defaultVariants: {
    variant: 'default',
    surface: 'default',
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
