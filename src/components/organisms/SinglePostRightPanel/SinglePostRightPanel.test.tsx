import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SinglePostRightPanel } from './SinglePostRightPanel';

vi.mock('@/atoms/Container', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/FeedbackCard', () => ({
  FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
}));

vi.mock('../SinglePostParticipants', () => ({
  SinglePostParticipants: ({ postId }: { postId: string }) => (
    <div data-testid="single-post-participants" data-post-id={postId}>
      SinglePostParticipants
    </div>
  ),
}));

describe('SinglePostRightPanel', () => {
  it('renders participants and feedback card', () => {
    render(<SinglePostRightPanel postId="author:post-1" />);

    expect(screen.getByTestId('single-post-participants')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('passes postId to SinglePostParticipants', () => {
    render(<SinglePostRightPanel postId="author:post-123" />);

    expect(screen.getByTestId('single-post-participants')).toHaveAttribute('data-post-id', 'author:post-123');
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostRightPanel postId="author:post-1" />);
    expect(container).toMatchSnapshot();
  });

  it('does not render feedback card if showFeedback is false', () => {
    render(<SinglePostRightPanel postId="author:post-1" showFeedback={false} />);

    expect(screen.queryByTestId('feedback-card')).not.toBeInTheDocument();
  });
});
