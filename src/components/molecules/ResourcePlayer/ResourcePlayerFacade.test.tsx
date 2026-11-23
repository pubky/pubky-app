import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { asOpaque } from '@/test-utils/type-assertions';
import { getPlayerTarget } from './resourcePlayer.utils';
import { ResourcePlayerFacade } from './ResourcePlayerFacade';

// The card's link preview is never read here: a card with no image left shows its type's icon.
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));

/** The app's image route, as the browser resolves it on the test page's origin. */
const ROUTE = new RegExp(`^(${window.location.origin})?/api/image\\?`);

const SONG = asOpaque<TPinakesResourceDetail>(musicFixture);
const VIDEO = asOpaque<TPinakesResourceDetail>(videoFixture);
const spotify = getPlayerTarget(SONG.uri)!;
const youTube = getPlayerTarget(VIDEO.uri)!;

function renderFacade(props: Partial<Parameters<typeof ResourcePlayerFacade>[0]> = {}) {
  const onPlay = vi.fn();
  render(<ResourcePlayerFacade card={SONG} target={spotify} title={SONG.name!} onPlay={onPlay} {...props} />);
  return { onPlay, facade: screen.getByTestId('player-facade') };
}

describe('ResourcePlayerFacade', () => {
  it('draws an audio player at its height from the card: cover, title and the service, one button', () => {
    const { facade, onPlay } = renderFacade();

    expect(facade.tagName).toBe('BUTTON');
    expect(facade).toHaveAccessibleName(`Play ${SONG.name} on Spotify`);
    expect(facade).toHaveStyle({ height: `${spotify.layout.kind === 'audio' ? spotify.layout.height : 0}px` });
    expect(facade).toHaveTextContent(SONG.name!);
    expect(facade).toHaveTextContent('Spotify');
    expect(screen.getByTestId('player-facade-image').getAttribute('src')).toMatch(ROUTE);
    expect(document.querySelector('iframe, audio, video, script')).toBeNull();
    expectNoThirdPartyLoads();

    fireEvent.click(facade);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('draws a video as its 16:9 still from the app’s image route, with a play glyph over it', () => {
    const { facade } = renderFacade({ card: VIDEO, target: youTube, title: VIDEO.name! });

    expect(facade).toHaveAccessibleName(`Play ${VIDEO.name} on YouTube`);
    expect(facade.style.aspectRatio).not.toBe('');
    const still = screen.getByTestId('player-facade-image').getAttribute('src')!;
    expect(still).toMatch(ROUTE);
    expect(decodeURIComponent(still)).toContain('hq720');
    expect(screen.getByTestId('player-facade-glyph')).toBeInTheDocument();
    expectNoThirdPartyLoads();
  });

  it('tries the next image when one fails twice, then shows the type’s icon, never the image’s host', () => {
    renderFacade({ card: VIDEO, target: { ...spotify, layout: { kind: 'audio', height: 152 } }, title: VIDEO.name! });
    const sources: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const image = screen.queryByTestId('player-facade-image');
      if (!image) break;
      sources.push(image.getAttribute('src')!);
      fireEvent.error(image);
    }
    expect(sources.every((src) => ROUTE.test(src))).toBe(true);
    expect(screen.queryByTestId('player-facade-image')).not.toBeInTheDocument();
    expectNoThirdPartyLoads();
  });

  it('names a preview’s press: it shows the player paused', () => {
    renderFacade({ preview: true });
    expect(screen.getByTestId('player-facade')).toHaveAccessibleName('Show the Spotify player');
  });

  it('is one button with no tooltip over the player, its text set apart for right-to-left titles', () => {
    const { facade } = renderFacade();
    expect(facade).not.toHaveAttribute('title');
    expect(facade).toHaveClass('text-start');
    expect(facade.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });

  it('keeps a short player to its title beside a small cover', () => {
    renderFacade({ target: { ...spotify, layout: { kind: 'audio', height: 54 } } });
    expect(screen.getByTestId('player-facade')).toHaveStyle({ height: '54px' });
    expect(screen.getByTestId('player-facade')).not.toHaveTextContent('Spotify');
  });
});
