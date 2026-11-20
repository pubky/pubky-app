import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceCardHeader } from './ResourceCardFrame';

const SHOW = 'https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485';

describe('ResourceCardHeader on a narrow card', () => {
  it('never cuts the type short: on a narrow card it wraps instead', () => {
    render(<ResourceCardHeader typeLabel="Podcast series" sourceUri={SHOW} href={SHOW} siteName="Apple Podcasts" />);

    const type = screen.getByTestId('resource-card-type');
    expect(type).toHaveTextContent('Podcast series');
    expect(type).not.toHaveClass('truncate');
    expect(type).toHaveClass('min-w-0');
  });

  it('shows the link out as the favicon and ↗ only on a phone, named "Open in <site>"', () => {
    render(<ResourceCardHeader typeLabel="Podcast series" sourceUri={SHOW} href={SHOW} siteName="Apple Podcasts" />);

    const link = screen.getByRole('link', { name: 'Open in Apple Podcasts' });
    expect(link).toHaveAttribute('href', SHOW);
    // Its icons never shrink away; the name is hidden below sm and stays the accessible name.
    expect(link).toHaveClass('max-sm:shrink-0');
    expect(within(link).getByText('Apple Podcasts')).toHaveClass('truncate', 'max-sm:hidden');
  });

  it('keeps the name of a source that is no link', () => {
    render(<ResourceCardHeader typeLabel="Book" sourceUri="isbn:9780000000002" href={null} siteName="Open Library" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Open Library')).not.toHaveClass('max-sm:hidden');
  });
});
