import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { GenericPreview } from './GenericPreview';

const { mockUseOgMetadata } = vi.hoisted(() => ({ mockUseOgMetadata: vi.fn() }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: mockUseOgMetadata }));

const media = (type: 'video' | 'audio', url: string) =>
  mockUseOgMetadata.mockReturnValue({
    metadata: { url, title: null, image: null, type },
    isLoading: false,
    error: null,
  });

describe('GenericPreview, a link that is a video or audio file', () => {
  beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));
  afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

  it.each([
    ['video', 'https://cdn.example.com/clip.mp4'],
    ['audio', 'https://cdn.example.com/song.mp3'],
  ] as const)('asks nothing of its site for a %s file until Play on, then plays it', (type, url) => {
    media(type, url);
    const { container } = render(<GenericPreview url={url} />);

    expect(container.querySelector('video, audio')).toBeNull();
    for (const node of container.querySelectorAll('[src]')) {
      expect(new URL(node.getAttribute('src') ?? '', window.location.href).origin).toBe(window.location.origin);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Play on cdn.example.com' }));

    const player = container.querySelector(type);
    expect(player).toHaveAttribute('src', url);
    expect(player).toHaveProperty('autoplay', true);
    expect(screen.getByRole('button', { name: 'Close the cdn.example.com video' })).toBeInTheDocument();
  });

  it('shows the player right away, not started, with platform embeds up front on', () => {
    useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: true } });
    media('video', 'https://cdn.example.com/clip.mp4');
    const { container } = render(<GenericPreview url="https://cdn.example.com/clip.mp4" />);

    expect(container.querySelector('video')).toHaveProperty('autoplay', false);
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
  });
});
