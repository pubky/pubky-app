import type { Session } from '@synonymdev/pubky';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { ScanContent } from './Scan';

// Keep useMobileAuth, useAuthUrl and the deeplink/platform helpers real so the tap is
// asserted against the URL the browser is actually sent to.
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { getSignupAuthUrl: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/molecules/Toaster/toast');

const INVITE_CODE = 'A9KM-7MJP-ERM9';
const GRANT_QUERY =
  'caps=%2Fpub%2Fpubky.app%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key';
const GRANT_URL = `pubkyauth://signup_grant?${GRANT_QUERY}`;
const RING_ANDROID_INTENT_URL = `intent://signup_grant?${GRANT_QUERY}#Intent;scheme=pubkyauth;package=to.pubky.ring;end`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile';

describe('ScanContent Android signup handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { href: 'https://example.test/onboarding/scan', pathname: '/onboarding/scan' });
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 });
    useOnboardingStore.setState({ inviteCode: INVITE_CODE });
    const flow: TGenerateAuthUrlResult = {
      authorizationUrl: GRANT_URL,
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: vi.fn(),
    };
    vi.mocked(AuthController.getSignupAuthUrl).mockResolvedValue(flow);
  });

  afterEach(() => {
    cleanup();
    useOnboardingStore.setState({ inviteCode: '' });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens Pubky Ring via a signup_grant intent URL for the pending signup request', async () => {
    render(<ScanContent />);
    const ring = await screen.findByRole('button', { name: 'Authorize with Pubky Ring' });

    fireEvent.click(ring);

    expect(window.location.href).toBe(RING_ANDROID_INTENT_URL);
    expect(screen.getByRole('button', { name: 'Opening Pubky Ring...' })).toBeDisabled();
    expect(AuthController.getSignupAuthUrl).toHaveBeenCalledExactlyOnceWith(INVITE_CODE, false);
  });
});
