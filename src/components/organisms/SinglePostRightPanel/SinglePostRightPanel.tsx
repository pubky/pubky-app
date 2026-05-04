import { Container } from '@/atoms/Container/Container';
import { FeedbackCard } from '../FeedbackCard/FeedbackCard';
import { SinglePostParticipants } from '../SinglePostParticipants/SinglePostParticipants';

import { SinglePostSidebarProps } from './SinglePostRightPanel.types';

export const SinglePostRightPanel = ({ postId, showFeedback = true }: SinglePostSidebarProps) => {
  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <SinglePostParticipants postId={postId} />
      {showFeedback && <FeedbackCard />}
    </Container>
  );
};
