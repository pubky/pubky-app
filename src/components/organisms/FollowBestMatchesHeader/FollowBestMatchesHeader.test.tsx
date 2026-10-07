import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FollowBestMatchesHeader } from './FollowBestMatchesHeader';

describe('FollowBestMatchesHeader', () => {
  it('renders the title with the brand-highlighted phrase', () => {
    render(<FollowBestMatchesHeader />);

    // toHaveTextContent (not a role name query): the space sits inside the brand span,
    // whose edge whitespace the accessible-name computation trims away.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Follow your best matches.');
    expect(screen.getByText('your best matches.')).toHaveClass('text-brand');
  });

  it('renders the subtitle', () => {
    render(<FollowBestMatchesHeader />);

    expect(screen.getByText('Add people you like to build your feed.')).toBeInTheDocument();
  });
});

describe('FollowBestMatchesHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<FollowBestMatchesHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
