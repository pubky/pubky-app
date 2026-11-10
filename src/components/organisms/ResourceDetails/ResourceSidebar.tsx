import { Container } from '@/atoms/Container/Container';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceAlsoOnList } from './ResourceAlsoOnList';
import { ResourceSimilarList } from './ResourceSimilarList';

interface ResourceSidebarProps {
  /** The page's card; nothing to show while it is read or when there is none. */
  card: TPinakesResourceDetail | null | undefined;
}

/**
 * The resource page's sidebar cards, where a post's page has its participants: Also on (the card's
 * other links and its group's other members, in one list), then Similar, each shown only when it
 * has entries (Similar also while read, or when it failed).
 */
export function ResourceSidebar({ card }: ResourceSidebarProps) {
  if (!card) return null;
  return (
    <Container overrideDefaults data-testid="resource-sidebar" className="flex w-full min-w-0 flex-col gap-6">
      <ResourceAlsoOnList card={card} />
      <ResourceSimilarList id={card.id} />
    </Container>
  );
}
