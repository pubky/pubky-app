import { Container } from '@/atoms/Container/Container';
import { FeedbackCard } from '@/organisms/FeedbackCard/FeedbackCard';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceAlsoOnList } from './ResourceAlsoOnList';
import { ResourceParticipants } from './ResourceParticipants';
import { ResourceSimilarList } from './ResourceSimilarList';

interface ResourceSidebarProps {
  /** The page's card; while it is read, or when there is none, only the people sections show. */
  card: TPinakesResourceDetail | null | undefined;
  /** The link the page's thread is on (`getThreadUri`); absent or `null`: no people sections. */
  uri?: string | null;
  /** Other spellings of `uri` (`getResourceTarget`): their taggers take part too. */
  spellings?: readonly string[];
  /** The page thread's reply ids (`useResourceReplies`): their authors are participants. */
  replyIds?: string[];
  /** The post page's Feedback card at the bottom (its right column, not its drawer). */
  showFeedback?: boolean;
}

/**
 * The resource page's sidebar cards: Also on (the card's other links and its group's other members,
 * in one list), then Similar, each shown only when it has entries (Similar also while read, or when
 * it failed); then, as on a post's page, Participants and the Feedback card.
 */
export function ResourceSidebar({ card, uri, spellings, replyIds = [], showFeedback = false }: ResourceSidebarProps) {
  if (!card && !uri) return null;
  return (
    <Container overrideDefaults data-testid="resource-sidebar" className="flex w-full min-w-0 flex-col gap-6">
      {card && <ResourceAlsoOnList card={card} />}
      {card && <ResourceSimilarList id={card.id} />}
      {uri && <ResourceParticipants uri={uri} spellings={spellings} replyIds={replyIds} />}
      {uri && showFeedback && <FeedbackCard />}
    </Container>
  );
}
