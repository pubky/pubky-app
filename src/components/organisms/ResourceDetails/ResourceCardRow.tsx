import type { ReactNode } from 'react';
import { getResourceRoute } from '@/app/routes';
import { getDisplayLink, getResourceListNote } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceListRow } from '@/molecules/ResourceCard/ResourceListRow';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

interface ResourceCardRowProps {
  card: TPinakesCard;
  testId: string;
  /** A line under the row (why a similar row is suggested). */
  trailing?: ReactNode;
}

/**
 * Another resource as a small row (a similar resource): its icon, title, and type
 * and site. It opens that resource's own page, where its links out are; any URI has a page, so
 * every row opens (an `isbn:` book, a `geo:` point).
 */
export function ResourceCardRow({ card, testId, trailing }: ResourceCardRowProps) {
  return (
    <ResourceListRow
      uri={card.uri}
      href={getResourceRoute(card.uri)}
      name={card.name || getDisplayLink(card.uri)}
      note={getResourceListNote(card)}
      trailing={trailing}
      testId={testId}
    />
  );
}
