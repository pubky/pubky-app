'use client';

import { PINAKES_RELATED_LIMIT } from '@/config/pinakes';
import { usePinakesRelated } from '@/hooks/usePinakesRelated/usePinakesRelated';
import { getDisplayLink } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceCardRow } from './ResourceCardRow';
import { ResourceSection } from './ResourceSection';
import { ResourceSimilarBecause } from './ResourceSimilarBecause';

interface ResourceSimilarListProps {
  /** The card's Pinakes ID (`card.id`), what `related=` is asked for. */
  id: string;
}

/**
 * Similar: what the people who tagged the resource also tagged (`related=<id>`), each row opening
 * its own page, with why when Pinakes says (`because`). Shown while read and on failure; nothing
 * once read with no result.
 */
export function ResourceSimilarList({ id }: ResourceSimilarListProps) {
  const { data, isLoading, isError } = usePinakesRelated(id);
  const cards = data?.slice(0, PINAKES_RELATED_LIMIT) ?? [];
  // Nothing similar once read: the section goes.
  if (!isLoading && !isError && cards.length === 0) return null;

  return (
    <ResourceSection
      title="Similar"
      count={isLoading || isError ? undefined : cards.length}
      description="People who tagged this also tagged"
      message={isError ? 'Similar links could not be loaded' : null}
      loadingRows={isLoading ? PINAKES_RELATED_LIMIT : 0}
      testId="resource-similar-list"
    >
      {/* Calendar occurrences share their feed's `id`: the index keeps the keys unique. */}
      {cards.map((card, index) => (
        <ResourceCardRow
          key={`${index}-${card.id}`}
          card={card}
          testId="resource-similar-list-row"
          trailing={
            card.because && card.because.shared > 0 ? (
              <ResourceSimilarBecause
                because={card.because}
                tagUri={card.refs[0] ?? card.uri}
                name={card.name || getDisplayLink(card.uri)}
              />
            ) : undefined
          }
        />
      ))}
    </ResourceSection>
  );
}
