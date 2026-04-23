import { Container } from '@/atoms/Container';
import { FeedbackCard } from '@/organisms/FeedbackCard';
import { SinglePostParticipants } from '../SinglePostParticipants';

import { SinglePostSidebarProps } from './SinglePostRightPanel.types';

export const SinglePostRightPanel = ({ postId, showFeedback = true }: SinglePostSidebarProps) => {
  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <SinglePostParticipants postId={postId} />
      {showFeedback && <FeedbackCard />}
    </Container>
  );
};
