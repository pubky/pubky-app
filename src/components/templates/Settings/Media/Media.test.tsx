import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPinakesConfigured } from '@/config/pinakes';
import { Media } from './Media';

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: vi.fn(() => true) }));

describe('Media', () => {
  afterEach(() => vi.mocked(isPinakesConfigured).mockReturnValue(true));

  it('renders the links and media section with its settings', () => {
    render(<Media />);
    expect(screen.getByText('Links and Media')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('Show platform embeds up front')).toBeInTheDocument();
  });

  it('shows no settings without Pinakes, which they would not act on', () => {
    vi.mocked(isPinakesConfigured).mockReturnValue(false);
    render(<Media />);
    expect(screen.getByText('Links and Media')).toBeInTheDocument();
    expect(screen.getByText('Link cards are not available here, so there is nothing to set.')).toBeInTheDocument();
    expect(screen.queryByText('Players')).not.toBeInTheDocument();
    expect(screen.queryByText('Show platform embeds up front')).not.toBeInTheDocument();
  });
});
