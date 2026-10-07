import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagsOfInterestHeader } from './TagsOfInterestHeader';

describe('TagsOfInterestHeader', () => {
  it('renders the title with the brand-highlighted word', () => {
    render(<TagsOfInterestHeader />);

    // toHaveTextContent (not a role name query): the space sits inside the brand span,
    // whose edge whitespace the accessible-name computation trims away.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tags of interest.');
    expect(screen.getByText('interest.')).toHaveClass('text-brand');
  });

  it('renders the subtitle', () => {
    render(<TagsOfInterestHeader />);

    expect(screen.getByText('Select topics to get suggestions on who to follow.')).toBeInTheDocument();
  });
});

describe('TagsOfInterestHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<TagsOfInterestHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
