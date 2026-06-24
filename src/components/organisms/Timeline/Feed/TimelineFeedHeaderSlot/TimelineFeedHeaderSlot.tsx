import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';

/**
 * Slot for hero/header content rendered as a direct child of `TimelineFeed`.
 */
export function TimelineFeedHeaderSlot({ children }: { children: ReactNode }) {
  return <Container overrideDefaults>{children}</Container>;
}
