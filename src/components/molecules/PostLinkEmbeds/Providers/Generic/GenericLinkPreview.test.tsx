import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import articleFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { GenericLinkPreview } from './GenericLinkPreview';

const mocks = vi.hoisted(() => ({
  configured: true,
  og: null as null | { url: string; type: 'website'; title: string | null; image: string | null },
}));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => mocks.configured,
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string | null) => ({ metadata: url ? mocks.og : null, isLoading: false, error: null }),
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: true }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const URL = 'https://www.franceinfo.fr/internet/article_8293859.html';
const CARD: TPinakesResourceDetail = {
  ...articleFixture,
  uri: URL,
  name: 'Quels sont les grands problèmes',
  also_on: [],
};
const givenCard = (data: TPinakesResourceDetail | null, isResolving = false) =>
  vi.mocked(usePinakesCard).mockReturnValue({ data, isLoading: false, isError: false, isResolving });

describe('GenericLinkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured = true;
    mocks.og = { url: URL, type: 'website', title: null, image: null };
  });

  it('asks Pinakes to read a link whose own preview says nothing, and shows the card it makes', () => {
    givenCard(CARD);
    render(<GenericLinkPreview url={URL} />);

    expect(usePinakesCard).toHaveBeenCalledWith(URL, { recheck: true, resolveOnView: true });
    expect(screen.getByTestId('resource-card-title')).toHaveTextContent('Quels sont les grands problèmes');
    expect(screen.queryByTestId('generic-website-preview')).not.toBeInTheDocument();
  });

  it('holds the card’s skeleton while Pinakes reads it, then keeps the preview when it makes no card', () => {
    givenCard(null, true);
    const { rerender } = render(<GenericLinkPreview url={URL} />);
    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();

    givenCard(null);
    rerender(<GenericLinkPreview url={URL} />);
    expect(screen.getByTestId('generic-website-preview')).toBeInTheDocument();
  });

  it.each([
    ['a title', { title: 'A page', image: null }],
    ['an image', { title: null, image: 'https://cdn.example.com/og.jpg' }],
  ])('sends nothing for a preview with %s', (_, preview) => {
    mocks.og = { url: URL, type: 'website', ...preview };
    givenCard(null);
    render(<GenericLinkPreview url={URL} />);

    expect(usePinakesCard).not.toHaveBeenCalled();
    expect(screen.getByTestId('generic-website-preview')).toBeInTheDocument();
  });

  it('leaves a link being written to the composer’s own debounced resolve, never one ask per keystroke', () => {
    givenCard(null);
    render(<GenericLinkPreview url={URL} isComposing />);

    expect(usePinakesCard).toHaveBeenCalledWith(URL, { resolve: true });
  });

  describe('a card on a service with a player (a Spotify song)', () => {
    const SONG = { ...musicFixture, also_on: [] } as TPinakesResourceDetail;
    beforeEach(() => {
      mocks.og = { url: SONG.uri, type: 'website', title: null, image: null };
      givenCard(SONG);
    });

    it('draws its player in the resource frame with platform embeds up front off, loading nothing before a press', () => {
      useSettingsStore.setState({ media: defaultMediaPreferences });
      render(<GenericLinkPreview url={SONG.uri} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(screen.getByTestId('player-facade')).toHaveAccessibleName(`Play ${SONG.name} on Spotify`);
      expect(frame).toContainElement(screen.getByTestId('player-facade'));
      expect(document.querySelector('iframe')).toBeNull();
      expectNoThirdPartyLoads();
    });

    it('keeps its card with platform embeds up front on, as before', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: true } });
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
      render(<GenericLinkPreview url={SONG.uri} />);

      expect(screen.getByTestId('resource-card-title')).toHaveTextContent(SONG.name!);
      expect(screen.queryByTestId('resource-embed-frame')).not.toBeInTheDocument();
      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
    });
  });

  it('sends nothing without Pinakes', () => {
    mocks.configured = false;
    render(<GenericLinkPreview url={URL} />);

    expect(usePinakesCard).not.toHaveBeenCalled();
  });
});
