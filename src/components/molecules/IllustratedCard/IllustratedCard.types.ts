import type { ComponentProps, ReactNode } from 'react';
import type { Card } from '@/atoms/Card/Card';

export type IllustratedCardLayout = 'row' | 'column';
export type IllustratedCardPaddingBreakpoint = 'md' | 'lg';
export type IllustratedCardVisualSizing = 'fixed' | 'intrinsic';

export interface IllustratedCardProps extends Omit<ComponentProps<typeof Card>, 'children'> {
  children: ReactNode;
  visual?: ReactNode;
  visualClassName?: ComponentProps<'div'>['className'];
  contentClassName?: ComponentProps<'div'>['className'];
  layout?: IllustratedCardLayout;
  paddingBreakpoint?: IllustratedCardPaddingBreakpoint;
  visualSizing?: IllustratedCardVisualSizing;
}
