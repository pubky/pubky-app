import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';

/**
 * Spacing slot for hero/header content rendered as a direct child of `TimelineFeed`.
 * Keeps a consistent gap between the header region and the feed grid below.
 */
export function TimelineFeedHeaderSlot({ children }: { children: ReactNode }) {
  return (
    <Container overrideDefaults className="mb-6">
      {children}
    </Container>
  );
}
