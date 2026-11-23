import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { GenericPreview } from './GenericPreview';

const { mockUseOgMetadata } = vi.hoisted(() => ({ mockUseOgMetadata: vi.fn() }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: mockUseOgMetadata }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const media = (type: 'video' | 'audio', url: string) =>
  mockUseOgMetadata.mockReturnValue({
    metadata: { url, title: null, image: null, type },
    isLoading: false,
    error: null,
  });

const pinakes = vi.hoisted(() => ({
  configured: true,
  card: null as null | Record<string, unknown>,
  calls: [] as unknown[][],
}));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => pinakes.configured,
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({
  usePinakesCard: (...args: unknown[]) => {
    pinakes.calls.push(args);
    return { data: args[0] ? pinakes.card : null, isLoading: false, isError: false };
  },
}));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: true }),
}));

describe('GenericPreview, a link that is an image file', () => {
  const FILE = 'https://files.example.com/photos/photo.jpg';
  const image = () =>
    mockUseOgMetadata.mockReturnValue({
      metadata: { url: FILE, title: null, image: null, type: 'image' },
      isLoading: false,
      error: null,
    });

  beforeEach(() => {
    useSettingsStore.setState({ media: defaultMediaPreferences });
    pinakes.configured = true;
    pinakes.card = null;
    pinakes.calls = [];
    image();
  });

  it('asks Pinakes to read it on view and shows the image its card carries from the app’s image route only', () => {
    pinakes.card = { uri: FILE, status: 'ok', image: FILE, type: 'ImageObject' };
    render(<GenericPreview url={FILE} />);

    expect(pinakes.calls[0]).toEqual([FILE, { recheck: true, resolveOnView: true }]);
    const src = new URL(screen.getByAltText('Image preview').getAttribute('src') ?? '', window.location.href);
    expect(src.origin).toBe(window.location.origin);
    expect(`${src.pathname}${src.search}`).toBe(`/api/image?${new URLSearchParams({ uri: FILE, src: FILE })}`);
  });

  it('shows a finished card, its name and site, with no card or once the route failed twice; never bare text', () => {
    render(<GenericPreview url={FILE} />);
    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent('photo.jpg');
    expect(screen.queryByAltText('Image preview')).not.toBeInTheDocument();

    pinakes.card = { uri: FILE, status: 'ok', image: FILE, type: 'ImageObject' };
    const { container } = render(<GenericPreview url={FILE} />);
    const shown = container.querySelector('img[alt="Image preview"]')!;
    fireEvent.error(shown);
    expect(container.querySelector('img[alt="Image preview"]')?.getAttribute('src')).toMatch(/&retry=1$/);
    fireEvent.error(container.querySelector('img[alt="Image preview"]')!);
    expect(container.querySelector('[data-testid="resource-link-card-title"]')).toHaveTextContent('photo.jpg');
  });

  it('serves no image of a card Pinakes is still reading', () => {
    pinakes.card = { uri: FILE, status: 'pending', image: FILE, type: 'ImageObject' };
    render(<GenericPreview url={FILE} />);

    expect(screen.queryByAltText('Image preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
  });

  it('asks nothing of Pinakes when it is unset', () => {
    pinakes.configured = false;
    render(<GenericPreview url={FILE} />);

    expect(pinakes.calls.every(([uri]) => uri === null)).toBe(true);
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
  });

  it('loads the file from its host as before, with platform embeds up front on', () => {
    useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: true } });
    render(<GenericPreview url={FILE} />);

    expect(screen.getByAltText('Image preview')).toHaveAttribute('src', FILE);
    expect(pinakes.calls).toHaveLength(0);
  });
});

describe('GenericPreview, a link that is a video or audio file', () => {
  beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));
  afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

  it.each([
    ['video', 'https://cdn.example.com/clip.mp4'],
    ['audio', 'https://cdn.example.com/song.mp3'],
  ] as const)(
    'shows a finished card for a %s file, asking nothing of its site until Play, then plays it inside',
    (type, url) => {
      media(type, url);
      const { container } = render(<GenericPreview url={url} />);
      const name = url.split('/').pop()!;

      const card = screen.getByTestId('media-preview');
      expect(card).toHaveAttribute('data-type', type);
      expect(card).toHaveTextContent(name);
      expect(card).toHaveTextContent(type === 'video' ? 'Video' : 'Audio');
      expect(container.querySelector('video, audio')).toBeNull();
      for (const node of container.querySelectorAll('[src]')) {
        expect(new URL(node.getAttribute('src') ?? '', window.location.href).origin).toBe(window.location.origin);
      }

      fireEvent.click(screen.getByRole('button', { name: `Play ${name} on cdn.example.com` }));

      const player = screen.getByTestId('media-preview-player').querySelector(type);
      expect(player).toHaveAttribute('src', url);
      expect(player).toHaveProperty('autoplay', true);
      expect(card).toContainElement(player as HTMLElement);

      // Close: back to the card, the file unloaded.
      fireEvent.click(screen.getByRole('button', { name: `Close ${name}` }));
      expect(container.querySelector('video, audio')).toBeNull();
      expect(screen.getByRole('button', { name: `Play ${name} on cdn.example.com` })).toBeInTheDocument();
    },
  );

  it('shows the player right away, not started, with platform embeds up front on', () => {
    useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: true } });
    media('video', 'https://cdn.example.com/clip.mp4');
    const { container } = render(<GenericPreview url="https://cdn.example.com/clip.mp4" />);

    expect(container.querySelector('video')).toHaveProperty('autoplay', false);
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
  });
});
