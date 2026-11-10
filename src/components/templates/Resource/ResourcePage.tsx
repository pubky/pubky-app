'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { PostPageLayout } from '@/organisms/PostPageShell/PostPageLayout';
import { ResourceDetails } from '@/organisms/ResourceDetails/ResourceDetails';
import { ResourceSidebar } from '@/organisms/ResourceDetails/ResourceSidebar';

interface ResourcePageProps {
  /** The link the page is for (`?uri=`), or `null` when none was given. */
  uri: string | null;
}

/**
 * Template for an external resource's page (`/resource?uri=…`), laid out as a single post's page
 * ({@link PostPageLayout}): the resource's card where the post stands, its sidebar cards (Also on,
 * Similar) where the participants are. Below `lg` they follow the card inline, since the mobile
 * header's right button is "Join Pubky" for visitors.
 */
export function ResourcePage({ uri }: ResourcePageProps) {
  // A failed read is not cached: a new attempt remounts the read and asks again.
  const [attempt, setAttempt] = useState(0);

  return <ResourcePageRead key={`${uri}:${attempt}`} uri={uri} onRetry={() => setAttempt((value) => value + 1)} />;
}

/** One read of the link's card, for the body and the sidebar cards alike. */
function ResourcePageRead({ uri, onRetry }: ResourcePageProps & { onRetry: () => void }) {
  const read = usePinakesCard(uri);
  const card = read.data;
  useResourceTitle(card?.name);

  return (
    <PostPageLayout
      rightSidebarContent={<ResourceSidebar card={card} />}
      rightDrawerContent={card ? <ResourceSidebar card={card} /> : null}
      showRightMobileButton={false}
      className={`${MOBILE_FAB_CLEARANCE_CLASS} lg:pb-12`}
    >
      <ResourceDetails uri={uri} read={read} onRetry={onRetry} />
      {card && (
        <Container overrideDefaults data-testid="resource-sidebar-inline" className="mt-6 lg:hidden">
          <ResourceSidebar card={card} />
        </Container>
      )}
    </PostPageLayout>
  );
}

/** The app's title suffix (`metadata.title` of the route is "External resource - Pubky App"). */
const TITLE_SUFFIX = ' - Pubky App';

/**
 * Names the tab after the resource once its card is read ("Kind of Blue - Pubky App"), so tabs and
 * history entries tell resources apart; the route's own title comes back on leaving.
 */
function useResourceTitle(name: string | null | undefined) {
  useEffect(() => {
    const title = name?.trim();
    if (!title) return;
    const previous = document.title;
    const own = `${title}${TITLE_SUFFIX}`;
    document.title = own;
    return () => {
      // After a client navigation the next route may have set its title already: keep that one.
      if (document.title === own) document.title = previous;
    };
  }, [name]);
}
