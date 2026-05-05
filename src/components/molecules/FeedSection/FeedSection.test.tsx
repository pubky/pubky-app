import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedSection } from './FeedSection';

describe('FeedSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<FeedSection />);
    expect(container).toBeTruthy();
  });

  it('renders Feed header', () => {
    render(<FeedSection />);
    expect(screen.getByText('Feed')).toBeInTheDocument();
  });

  it('renders default feed items', () => {
    render(<FeedSection />);

    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.getByText('Based Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('Mining Industry')).toBeInTheDocument();
    expect(screen.getByText('Lightning Network')).toBeInTheDocument();
    expect(screen.getByText('Design UX/UI')).toBeInTheDocument();
  });

  it('renders Create Feed button by default', () => {
    render(<FeedSection />);
    expect(screen.getByText('Create Feed')).toBeInTheDocument();
  });

  it('hides Create Feed button when showCreateButton is false', () => {
    render(<FeedSection showCreateButton={false} />);
    expect(screen.queryByText('Create Feed')).not.toBeInTheDocument();
  });
});

describe('FeedSection - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<FeedSection />);
    expect(container).toMatchSnapshot();
  });
});
