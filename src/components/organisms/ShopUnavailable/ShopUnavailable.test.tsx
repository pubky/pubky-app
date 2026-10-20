import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShopUnavailable } from './ShopUnavailable';

// Independent feed/profile queries are covered by ContentLayout's tests.
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('ShopUnavailable', () => {
  it('shows the unavailable state without an iframe or external Shop link', () => {
    const { container } = render(<ShopUnavailable />);
    expect(screen.getByRole('heading', { name: 'Shop unavailable' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Shop is temporarily unavailable. It will reopen automatically when the connection is restored.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });
});
