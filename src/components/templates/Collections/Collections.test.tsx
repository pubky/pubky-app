import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Collections } from './Collections';

vi.mock('@/organisms/Collections/CollectionsSections/CollectionsSections', () => ({
  CollectionsSections: () => <div data-testid="collections-sections" />,
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

  it('matches the snapshot', () => {
    const { container } = render(<Collections />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
