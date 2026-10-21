import type { Session } from '@synonymdev/pubky';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { SignInContent } from './SignIn';

// Keep useMobileAuth, useAuthUrl and the deeplink/platform helpers real so each tap is
// asserted against the URL the browser is actually sent to.
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { getAuthUrl: vi.fn() },
}));
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => 'disabled',
}));
vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({ startPassportAuth: vi.fn(), isPending: false }),
}));
vi.mock('@/molecules/Toaster/toast');

const GRANT_QUERY =
  'caps=%2Fpub%2Fpubky.app%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key';
const GRANT_URL = `pubkyauth://signin_grant?${GRANT_QUERY}`;
const RING_ANDROID_INTENT_URL = `intent://signin_grant?${GRANT_QUERY}#Intent;scheme=pubkyauth;package=to.pubky.ring;end`;
const BITKIT_ANDROID_INTENT_URL = `intent://signin_grant?${GRANT_QUERY}#Intent;scheme=pubkyauth;package=to.bitkit;end`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile';

function pendingFlow(): TGenerateAuthUrlResult {
  return {
    authorizationUrl: GRANT_URL,
    awaitApproval: new Promise<Session>(() => {}),
    cancelAuthFlow: vi.fn(),
  };
}

describe('SignInContent Android signer handoff', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { href: 'https://example.test/sign-in', pathname: '/sign-in' });
    vi.stubGlobal('navigator', {
      userAgent: ANDROID,
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
      clipboard: { writeText },
    });
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pendingFlow());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens each signer package via an intent URL from the same sign-in request', async () => {
    render(<SignInContent />);
    const bitkit = await screen.findByRole('button', { name: 'Authorize with Bitkit' });

    fireEvent.click(bitkit);
    expect(window.location.href).toBe(BITKIT_ANDROID_INTENT_URL);
    expect(screen.getByRole('button', { name: 'Opening Bitkit...' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Authorize with Pubky Ring' }));
    expect(window.location.href).toBe(RING_ANDROID_INTENT_URL);
    expect(screen.getByRole('button', { name: 'Opening Pubky Ring...' })).toBeDisabled();
    expect(AuthController.getAuthUrl).toHaveBeenCalledOnce();
  });

  it('keeps the copied QR link as the plain pubkyauth URL', async () => {
    render(<SignInContent />);
    const qr = await screen.findByRole('button', { name: 'Copy authentication link' });
    await waitFor(() => expect(qr).toBeEnabled());

    await act(async () => fireEvent.click(qr));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(GRANT_URL);
  });
});
