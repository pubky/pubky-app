import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionHiddenItemsNotice } from './CollectionHiddenItemsNotice';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

describe('CollectionHiddenItemsNotice', () => {
  it('renders the hidden-items copy as a status banner with a decorative info icon', () => {
    const { container } = render(<CollectionHiddenItemsNotice />);

    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-cy', 'collection-hidden-items-notice');
    expect(screen.getByText('collections.single.hiddenItemsNotice')).toBeInTheDocument();

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('text-muted-foreground');
  });
});

describe('CollectionHiddenItemsNotice - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<CollectionHiddenItemsNotice />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
