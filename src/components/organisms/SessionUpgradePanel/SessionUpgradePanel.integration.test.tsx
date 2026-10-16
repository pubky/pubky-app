import type { Session } from '@synonymdev/pubky';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOP_CAPABILITIES } from '@/config/auth';
import { AuthController } from '@/controllers/auth/auth';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { toast } from '@/molecules/Toaster/toast';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { SessionUpgradePanel } from './SessionUpgradePanel';

// Keep both auth hooks and the deeplink/platform helpers real: a button click must reach
// the existing upgrade request, not accidentally start the sign-in flow or another grant.
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    getAuthUrl: vi.fn(),
    getSignupAuthUrl: vi.fn(),
    getUpgradeAuthUrl: vi.fn(),
    requestCapabilities: vi.fn(),
  },
}));
vi.mock('@/molecules/Toaster/toast');

const GRANT_QUERY =
  'caps=%2Fpub%2Fpaykit%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key';
const GRANT_URL = `pubkyauth://signin_grant?${GRANT_QUERY}`;
const BITKIT_IOS_URL = `bitkit://pubky-auth/signin?${GRANT_QUERY}`;
const PAGE_URL = 'https://example.test/shop';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile';

function pendingApproval(url = GRANT_URL) {
  let reject!: (error: unknown) => void;
  const flow: TGenerateAuthUrlResult = {
    authorizationUrl: url,
    awaitApproval: new Promise<Session>((_, fail) => {
      reject = fail;
    }),
    cancelAuthFlow: vi.fn(),
  };
  return { flow, reject };
}

describe.each([
  { feature: 'Locks', requiredCapabilities: undefined },
  { feature: 'Shop', requiredCapabilities: SHOP_CAPABILITIES },
])('SessionUpgradePanel $feature signer handoff', ({ requiredCapabilities }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { href: PAGE_URL, pathname: '/shop' });
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const upgradeRequest = requiredCapabilities
    ? vi.mocked(AuthController.requestCapabilities)
    : vi.mocked(AuthController.getUpgradeAuthUrl);

  it('opens Bitkit on iOS with the current grant and lets the user switch back to Ring', async () => {
    const approval = pendingApproval();
    upgradeRequest.mockResolvedValue(approval.flow);
    render(<SessionUpgradePanel requiredCapabilities={requiredCapabilities} />);
    const bitkit = await screen.findByRole('button', { name: 'Continue with Bitkit' });
    expect(bitkit).toBeEnabled();

    fireEvent.click(bitkit);

    expect(window.location.href).toBe(BITKIT_IOS_URL);
    expect(screen.getByRole('button', { name: 'Opening Bitkit...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Pubky Ring' }));
    expect(window.location.href).toBe(GRANT_URL);
    expect(screen.getByRole('button', { name: 'Opening Pubky Ring...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled();
    expect(upgradeRequest).toHaveBeenCalledExactlyOnceWith(
      ...(requiredCapabilities ? [requiredCapabilities, false] : [false]),
    );
    expect(AuthController.getAuthUrl).not.toHaveBeenCalled();
    expect(approval.flow.cancelAuthFlow).not.toHaveBeenCalled();
  });

  it('keeps the original grant URL on Android and resets the launch state on handoff', async () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 });
    upgradeRequest.mockResolvedValue(pendingApproval().flow);
    render(<SessionUpgradePanel requiredCapabilities={requiredCapabilities} />);
    const bitkit = await screen.findByRole('button', { name: 'Continue with Bitkit' });
    expect(bitkit).toBeEnabled();

    fireEvent.click(bitkit);

    expect(window.location.href).toBe(GRANT_URL);
    expect(screen.getByRole('button', { name: 'Opening Bitkit...' })).toBeDisabled();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled();
    expect(upgradeRequest).toHaveBeenCalledOnce();
  });

  it('expires a canceled approval and refreshes once before another Bitkit tap can launch', async () => {
    const canceled = pendingApproval();
    const replacement = pendingApproval(`${GRANT_URL}&replacement=1`);
    upgradeRequest.mockResolvedValueOnce(canceled.flow).mockResolvedValueOnce(replacement.flow);
    render(<SessionUpgradePanel requiredCapabilities={requiredCapabilities} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled());

    await act(async () => canceled.reject(createCanceledError()));

    expect(toast).not.toHaveBeenCalled();
    const reload = screen.getAllByRole('button', { name: 'Click to reload' });
    expect(reload).toHaveLength(2);
    fireEvent.click(reload[1]);
    expect(window.location.href).toBe(PAGE_URL);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Bitkit' }));

    expect(window.location.href).toBe(`${BITKIT_IOS_URL}&replacement=1`);
    expect(upgradeRequest).toHaveBeenCalledTimes(2);
    expect(upgradeRequest).toHaveBeenLastCalledWith(...(requiredCapabilities ? [requiredCapabilities, true] : [true]));
    expect(AuthController.getAuthUrl).not.toHaveBeenCalled();
  });
});
