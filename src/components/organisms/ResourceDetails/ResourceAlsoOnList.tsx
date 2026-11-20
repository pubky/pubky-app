'use client';

import { type ComponentProps, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import { useResourceRowCounts } from '@/hooks/useResourceRowCounts/useResourceRowCounts';
import { getAlsoOnName, getAlsoOnNote, getAlsoOnRoute, getHttpUrl } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceListRow } from '@/molecules/ResourceCard/ResourceListRow';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceAlsoOnLanguagesRow } from './ResourceAlsoOnLanguagesRow';
import { getAlsoOnSource, mergeAlsoOn } from './ResourceAlsoOnList.utils';
import { ResourceSection } from './ResourceSection';

interface ResourceAlsoOnListProps {
  /** The page's card: its `also_on`, its `group`, and its own service and link (left out of the list). */
  card: Pick<TPinakesResourceDetail, 'id' | 'uri' | 'site' | 'refs' | 'also_on' | 'group' | 'open_in'>;
}

/** Rows shown before "Show N more": a long list (a track on a dozen services) stays calm. */
const ALSO_ON_VISIBLE_ROWS = 5;

/**
 * Also on, on the page: one row per other service (`mergeAlsoOn`: the card's `also_on` and its
 * group's other members), a service in several languages as one row with a language select. A row
 * opens that link's page on Pubky, with its counts and a ↗ to a web link's service; the first
 * `ALSO_ON_VISIBLE_ROWS` show, the rest behind "Show N more". Nothing for no other service.
 */
export function ResourceAlsoOnList({ card }: ResourceAlsoOnListProps) {
  const { data: group } = usePinakesGroup(card.group?.id);
  const rows = mergeAlsoOn(card, group?.members);
  const [isExpanded, setIsExpanded] = useState(false);
  if (rows.length === 0) return null;
  // "Show 1 more" would take the row's own place: a list one longer than the limit shows whole.
  const hidden = rows.length > ALSO_ON_VISIBLE_ROWS + 1 ? rows.length - ALSO_ON_VISIBLE_ROWS : 0;
  const visibleRows = isExpanded || hidden === 0 ? rows : rows.slice(0, ALSO_ON_VISIBLE_ROWS);

  return (
    <ResourceSection
      title="Also on"
      count={rows.length}
      description="The same thing on other services"
      testId="resource-also-on-list"
      footer={
        hidden > 0
          ? {
              icon: isExpanded ? ChevronUp : ChevronDown,
              text: isExpanded ? 'Show less' : `Show ${hidden} more`,
              onClick: () => setIsExpanded((value) => !value),
              expanded: isExpanded,
            }
          : undefined
      }
    >
      {visibleRows.map((row, index) => {
        if (row.kind === 'languages') {
          return (
            <ResourceAlsoOnLanguagesRow
              key={`${index}-${row.name}`}
              name={row.name}
              editions={row.editions}
              testId="resource-also-on-list-row"
            />
          );
        }
        return (
          <ResourceAlsoOnRow
            key={`${index}-${row.entry.uri}`}
            uri={row.entry.uri}
            href={getAlsoOnRoute(row.entry.uri)}
            // Out of the app to the service; none for a link that is not a web link (`isbn:`, `doi:`).
            externalHref={getHttpUrl(row.entry.uri)}
            name={getAlsoOnName(row.entry)}
            // A link that is not a web link keeps its identifier (`10.1038/…` under DOI).
            note={getAlsoOnNote(row.entry, undefined, { withSource: false })}
            source={getAlsoOnSource(row.entry)}
            testId="resource-also-on-list-row"
          />
        );
      })}
    </ResourceSection>
  );
}

/** One Also on row with its link's counts (`useResourceRowCounts`). */
function ResourceAlsoOnRow(props: Omit<ComponentProps<typeof ResourceListRow>, 'counts'>) {
  const counts = useResourceRowCounts(props.uri);
  return <ResourceListRow {...props} counts={counts} />;
}
