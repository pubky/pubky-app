import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { useShareUrl } from './useShareUrl';

const { mockCopyToClipboard } = vi.hoisted(() => ({
  mockCopyToClipboard: vi.fn(),
}));

vi.mock('@/libs/utils/utils', async () => {
  const actual = await vi.importActual<typeof import('@/libs/utils/utils')>('@/libs/utils/utils');
  return {
    ...actual,
    copyToClipboard: mockCopyToClipboard,
  };
});

vi.mock('@/molecules/Toaster/toast');

const URL = 'https://pubky.app/collections/author/0034BBBDFK83G';

function stubShareSheet(share?: (data: ShareData) => Promise<void>, canShare?: (data: ShareData) => boolean) {
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(window.navigator, 'canShare', { value: canShare, configurable: true });
}

describe('useShareUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockResolvedValue(undefined);
    vi.mocked(toast).mockReturnValue({ dismiss: vi.fn() });
    stubShareSheet(undefined, undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'share');
    Reflect.deleteProperty(window.navigator, 'canShare');
  });

  it('copies to the clipboard when the browser has no share sheet', async () => {
    const { result } = renderHook(() => useShareUrl());

    await expect(result.current.shareUrl(URL)).resolves.toBe(true);
    expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: URL });
    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link copied to clipboard' }));
  });

  it('hands the URL to the native share sheet and does not touch the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShareSheet(share, () => true);

    const { result } = renderHook(() => useShareUrl({ title: 'Based Bitcoin' }));

    await expect(result.current.shareUrl(URL)).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ url: URL, title: 'Based Bitcoin' });
    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('omits the title from the share payload when no title is given', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShareSheet(share, () => true);

    const { result } = renderHook(() => useShareUrl());

    await result.current.shareUrl(URL);
    expect(share).toHaveBeenCalledWith({ url: URL });
  });

  it('falls back to the clipboard when the browser cannot share this URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShareSheet(share, () => false);

    const { result } = renderHook(() => useShareUrl());

    await expect(result.current.shareUrl(URL)).resolves.toBe(true);
    expect(share).not.toHaveBeenCalled();
    expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: URL });
  });

  it('stays silent when the user dismisses the share sheet', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    stubShareSheet(vi.fn().mockRejectedValue(abort), () => true);

    const { result } = renderHook(() => useShareUrl());

    await expect(result.current.shareUrl(URL)).resolves.toBe(false);
    expect(mockCopyToClipboard).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when the share sheet fails for another reason', async () => {
    stubShareSheet(vi.fn().mockRejectedValue(new Error('share boom')), () => true);

    const { result } = renderHook(() => useShareUrl());

    await expect(result.current.shareUrl(URL)).resolves.toBe(true);
    expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: URL });
  });

  it('reports the configured failure copy when the fallback copy fails too', async () => {
    mockCopyToClipboard.mockRejectedValue(new Error('clipboard boom'));

    const { result } = renderHook(() => useShareUrl({ errorDescription: 'Could not share collection' }));

    await expect(result.current.shareUrl(URL)).resolves.toBe(false);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not share collection',
    });
  });
});
