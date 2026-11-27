import { NextRequest } from 'next/server';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageApplication } from '@/application/image/image';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { GET } from './route';

// The route, its controller and application run for real; only the reads they make are stubbed.
const { mockCard, mockImageFetch } = vi.hoisted(() => ({ mockCard: vi.fn(), mockImageFetch: vi.fn() }));
vi.mock('@/services/pinakes/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/pinakes/pinakes')>()),
  PinakesService: { readCardForImage: mockCard, readGroupForImage: vi.fn(), readEpisodesForImage: vi.fn() },
}));
vi.mock('@/services/nextjs/image/image', () => ({ NextJsImageService: { fetch: mockImageFetch } }));
vi.mock('@/services/nextjs/og-metadata/og-metadata', () => ({
  NextJsOgMetadataService: { fetch: vi.fn() },
  isTransientOgFallback: () => false,
  SAFE_OG_METADATA_DISPATCHER: { guarded: true },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({
  usePinakesGroup: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(() => {
  ImageApplication.clearCache();
  mockCard.mockReset();
  mockImageFetch.mockReset();
  mockImageFetch.mockResolvedValue({ body: JPEG.buffer, contentType: 'image/jpeg' });
});

describe('GET /api/image for the image a card shows', () => {
  it('serves a gone (`missing`) card’s dimmed cover the card asks for', async () => {
    const gone: TPinakesResourceDetail = { ...musicFixture, status: PinakesStatus.MISSING, group: null };
    mockCard.mockResolvedValue(gone);
    render(<ResourceCard card={gone} />);

    expect(screen.getByTestId('resource-card-image')).toHaveClass('opacity-60');
    const src = within(screen.getByTestId('resource-card-image')).getByRole('img').getAttribute('src')!;
    const response = await GET(new NextRequest(new URL(src, 'https://pubky.app')));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    expect(String(mockImageFetch.mock.calls[0][0])).toBe(musicFixture.image);
  });

  it('refuses the cover of a card Pinakes is still reading', async () => {
    mockCard.mockResolvedValue({ ...musicFixture, status: PinakesStatus.PENDING });
    const query = new URLSearchParams({ uri: musicFixture.uri, src: musicFixture.image! });
    const response = await GET(new NextRequest(`https://pubky.app/api/image?${query}`));

    expect(response.status).toBe(404);
    expect(mockImageFetch).not.toHaveBeenCalled();
  });
});
