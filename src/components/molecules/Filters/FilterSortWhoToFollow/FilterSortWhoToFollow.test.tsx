import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterSortWhoToFollow } from './FilterSortWhoToFollow';

describe('FilterSortWhoToFollow', () => {
  it('renders sort title', () => {
    render(<FilterSortWhoToFollow />);
    expect(screen.getByText('Sort')).toBeInTheDocument();
  });

  it('renders all sort options', () => {
    render(<FilterSortWhoToFollow />);
    expect(screen.getByLabelText('Suggested')).toBeInTheDocument();
    expect(screen.getByLabelText('Mutual')).toBeInTheDocument();
    expect(screen.getByLabelText('Followers')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders with Suggested selected by default', () => {
    render(<FilterSortWhoToFollow />);
    const suggestedOption = screen.getByLabelText('Suggested');
    expect(suggestedOption).toHaveAttribute('aria-checked', 'true');
  });

  it('renders all options as disabled', () => {
    render(<FilterSortWhoToFollow />);
    expect(screen.getByLabelText('Suggested')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Mutual')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Followers')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-disabled', 'true');
  });

  it('has correct test id', () => {
    render(<FilterSortWhoToFollow />);
    expect(screen.getByTestId('filter-sort-who-to-follow-radiogroup')).toBeInTheDocument();
  });
});

describe('FilterSortWhoToFollow - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<FilterSortWhoToFollow />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
