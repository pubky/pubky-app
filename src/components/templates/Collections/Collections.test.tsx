import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Collections } from './Collections';

vi.mock('@/organisms/Collections/CollectionsSections/CollectionsSections', () => ({
  CollectionsSections: ({ showMyCollectionsPublicNote }: { showMyCollectionsPublicNote?: boolean }) => (
    <div data-testid="collections-sections" data-show-my-public-note={String(showMyCollectionsPublicNote ?? false)} />
  ),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: ReactNode }) => <div data-testid="content-layout">{children}</div>,
}));

describe('Collections (template)', () => {
  it('renders ContentLayout containing the CollectionsSections organism', () => {
    render(<Collections />);

    const layout = screen.getByTestId('content-layout');
    const sections = screen.getByTestId('collections-sections');
    expect(layout).toBeInTheDocument();
    expect(sections).toBeInTheDocument();
    expect(layout).toContainElement(sections);
  });

  it('enables the My Collections public note on the /collections route', () => {
    render(<Collections />);

    expect(screen.getByTestId('collections-sections')).toHaveAttribute('data-show-my-public-note', 'true');
  });

  it('matches the snapshot', () => {
    const { container } = render(<Collections />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
