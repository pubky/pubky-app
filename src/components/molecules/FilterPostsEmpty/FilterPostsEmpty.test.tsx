import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterPostsEmpty } from './FilterPostsEmpty';

vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => ({
  IllustratedEmptyState: ({
    imageSrc,
    icon: Icon,
    title,
    subtitle,
    dataCy,
  }: {
    imageSrc: string;
    imageAlt: string;
    icon: React.ComponentType;
    title: string;
    subtitle: React.ReactNode;
    dataCy?: string;
  }) => (
    <div data-testid="empty-state" data-src={imageSrc} data-cy={dataCy}>
      <Icon />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  ),
}));

describe('FilterPostsEmpty', () => {
  it('renders the no-results title and hint', () => {
    render(<FilterPostsEmpty />);

    expect(screen.getByText('No posts match your search')).toBeInTheDocument();
    expect(screen.getByText('Try a different search term.')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-cy', 'profile-filter-posts-empty');
  });
});
