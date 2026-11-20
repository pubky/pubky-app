import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceSourceIcon } from './ResourceSourceIcon';

const icon = (container: HTMLElement) => container.querySelector('svg');

describe('ResourceSourceIcon', () => {
  it('loads a web link’s own favicon and shows a globe when it fails', () => {
    const { container } = render(<ResourceSourceIcon uri="https://tidal.com/album/2178485" />);

    const favicon = screen.getByTestId('resource-source-favicon');
    expect(favicon).toHaveAttribute('src', 'https://tidal.com/favicon.ico');
    fireEvent.error(favicon);

    expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    expect(icon(container)).toHaveClass('lucide-globe');
  });

  it('asks Discogs where its icon is, and inverts the all-black ones for the dark theme', () => {
    render(<ResourceSourceIcon uri="https://www.discogs.com/master/96559" />);

    const discogs = screen.getByTestId('resource-source-favicon');
    expect(discogs).toHaveAttribute('src', 'https://st.discogs.com/favicon.ico');
    expect(discogs).toHaveClass('dark:invert');
    expect(discogs).not.toHaveClass('invert');
  });

  it('asks only the override for an overridden site: no parent domain, the globe when it fails', () => {
    const { container } = render(<ResourceSourceIcon uri="https://www.discogs.com/master/96559" />);

    fireEvent.error(screen.getByTestId('resource-source-favicon'));

    expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    expect(icon(container)).toHaveClass('lucide-globe');
  });

  it.each([
    ['https://tycho.bandcamp.com/album/dive', 'https://s4.bcbits.com/img/favicon/favicon-32x32.png'],
    ['https://audius.co/artist/track', 'https://audius.co/favicons/favicon-32x32.png'],
    [
      'https://music.amazon.fr/albums/B00C0A9E1E',
      'https://m.media-amazon.com/images/G/01/music/logo/1.0/smile_256x256.png',
    ],
  ])('shows %s with the icon its pages name, not inverted', (uri, src) => {
    render(<ResourceSourceIcon uri={uri} />);

    const favicon = screen.getByTestId('resource-source-favicon');
    expect(favicon).toHaveAttribute('src', src);
    expect(favicon).not.toHaveClass('dark:invert');
  });

  it('inverts GitHub’s, TIDAL’s and Mixcloud’s dark favicons and leaves other sites’ as they are', () => {
    render(
      <>
        <ResourceSourceIcon uri="https://github.com/pubky/pubky-app" />
        <ResourceSourceIcon uri="https://tidal.com/track/490851477" />
        <ResourceSourceIcon uri="https://www.mixcloud.com/spartacus/party-time/" />
        <ResourceSourceIcon uri="https://www.deezer.com/album/320429237" />
      </>,
    );

    const [github, tidal, mixcloud, deezer] = screen.getAllByTestId('resource-source-favicon');
    expect(github).toHaveAttribute('src', 'https://github.com/favicon.ico');
    expect(mixcloud).toHaveAttribute('src', 'https://www.mixcloud.com/favicon.ico');
    for (const dark of [github, tidal, mixcloud]) {
      expect(dark).toHaveClass('dark:invert');
      expect(dark).not.toHaveClass('invert');
    }
    expect(deezer).not.toHaveClass('dark:invert');
  });

  it.each([
    ['isbn:9780140328721', 'lucide-book-open'],
    ['doi:10.1038/nature12373', 'lucide-file-text'],
    ['geo:52.5174,13.3951', 'lucide-map-pin'],
    ['nostr:note1abc', 'lucide-link-2'],
  ])('shows %s by the kind of identifier, never a favicon', (uri, iconClass) => {
    const { container } = render(<ResourceSourceIcon uri={uri} />);

    expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    expect(icon(container)).toHaveClass(iconClass);
  });

  it('shows the Pubky mark for a pubky:// link', () => {
    const { container } = render(
      <ResourceSourceIcon uri="pubky://o4dksfbqk85ogzdb5osziw6befigbuxmuxkuxq8434q89uj56uyy/pub/x" />,
    );

    expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    expect(icon(container)).toHaveAttribute('viewBox', '0 0 22 33');
  });

  describe('fallbacks and bundled marks', () => {
    it('tries the parent domain’s favicon when a subdomain’s fails, and the globe only after both', () => {
      const { container } = render(<ResourceSourceIcon uri="https://open.qobuz.com/album/0888880696069" />);

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        'https://open.qobuz.com/favicon.ico',
      );
      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute('src', 'https://qobuz.com/favicon.ico');
      expect(icon(container)).toBeNull();
      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
      expect(icon(container)).toHaveClass('lucide-globe');
    });

    it('does not climb to a registry suffix (bbc.co.uk → globe, not co.uk)', () => {
      const { container } = render(<ResourceSourceIcon uri="https://bbc.co.uk/news" />);

      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
      expect(icon(container)).toHaveClass('lucide-globe');
    });

    it('tries a new link’s own favicon even after another link’s failed, and never a failed one again', () => {
      const { container, rerender } = render(<ResourceSourceIcon uri="https://open.qobuz.com/album/1" />);
      fireEvent.error(screen.getByTestId('resource-source-favicon'));
      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      rerender(<ResourceSourceIcon uri="https://play.qobuz.com/album/2" />);

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        'https://play.qobuz.com/favicon.ico',
      );
      fireEvent.error(screen.getByTestId('resource-source-favicon'));
      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
      expect(icon(container)).toHaveClass('lucide-globe');
    });

    it.each(['https://music.apple.com/album/268443092', 'https://geo.music.apple.com/x', 'https://itunes.apple.com/x'])(
      'draws the bundled Apple Music mark for %s, asking nothing',
      (uri) => {
        const { container } = render(<ResourceSourceIcon uri={uri} />);

        expect(screen.getByTestId('resource-source-brand')).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('stop[stop-color="#FA243C"]')).toBeInTheDocument();
        expect(container.querySelector('img, [src], [href]')).toBeNull();
      },
    );

    it('keeps the favicon for other Apple sites', () => {
      render(<ResourceSourceIcon uri="https://maps.apple.com/place?q=1" />);

      expect(screen.queryByTestId('resource-source-brand')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        'https://maps.apple.com/favicon.ico',
      );
    });
  });
});
