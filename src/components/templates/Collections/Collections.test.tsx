import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Collections } from './Collections';

vi.mock('@/organisms/Collections/CollectionsSections/CollectionsSections', () => ({
  CollectionsSections: () => <div data-testid="collections-sections" />,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="content-layout" className={className}>
      {children}
    </div>
  ),
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

  it('keeps bottom clearance for the floating action button on mobile only', () => {
    render(<Collections />);

    expect(screen.getByTestId('content-layout')).toHaveClass('pb-44', 'lg:pb-12');
  });
});
