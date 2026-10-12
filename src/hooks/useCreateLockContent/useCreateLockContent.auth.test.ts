import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { act, renderHook } from '@testing-library/react';
import { PubkyAppPostKind } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { useCreateLockContent } from '@/hooks/useCreateLockContent/useCreateLockContent';
import { useLocksAuthFlow } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { asOpaque } from '@/test-utils/type-assertions';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  exchange: vi.fn(),
  connect: vi.fn(),
  config: vi.fn(),
  setup: vi.fn(),
}));
vi.mock('@/application/locks/locks', () => ({
  LocksApplication: {
    createLockContent: mocks.create,
    fetchPaykitSetupStatus: mocks.setup,
    exchangeSessionCode: mocks.exchange,
    generateConnectUrl: mocks.connect,
    setLockServiceConfig: mocks.config,
  },
}));
vi.mock('@/controllers/post/post', () => ({ PostController: { commitCreate: vi.fn() } }));

const params = {
  lockedPost: { content: 'locked body', kind: PubkyAppPostKind.Short, attachments: [] },
  announcement: { teaser: { lock_title: 'Title', teaser_description: 'Teaser' }, attachments: [], tags: [] },
  lockConfig: { amount: '1000', asset: 'BTC' as const },
};
const rejectedSession = () =>
  Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Rejected old Locks session', {
    service: ErrorService.Locks,
    operation: 'createLockContent',
  });

describe('useCreateLockContent reauthentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setup.mockResolvedValue('ready');
    LocksController.clearSession();
  });

  afterEach(() => {
    LocksController.clearSession();
    useAuthStore.setState({ currentUserPubky: null });
  });

  it.each(['before', 'after'] as const)(
    'keeps a newer sign-in when an abandoned publish returns a 401 %s its exchange resolves',
    async (rejectionTiming) => {
      const oldSession = asOpaque<LocksSdkSession>({ creatorPubky: () => `pubky${MOCK_LOCK_AUTHOR_PUBKY}` });
      const newSession = asOpaque<LocksSdkSession>({ creatorPubky: () => `pubky${MOCK_LOCK_AUTHOR_PUBKY}` });
      useAuthStore.setState({ currentUserPubky: MOCK_LOCK_AUTHOR_PUBKY });
      useLocksAuthStore.getState().init({ session: oldSession, secret: 'old-secret' });
      const abandoned = Promise.withResolvers<never>();
      const active = Promise.withResolvers<never>();
      const exchange = Promise.withResolvers<{ session: LocksSdkSession; secret: string }>();
      mocks.create.mockReturnValueOnce(abandoned.promise).mockReturnValueOnce(active.promise);
      mocks.exchange.mockReturnValue(exchange.promise);
      mocks.connect.mockResolvedValue('https://lock.server/connect?delivery=postmessage');
      mocks.config.mockResolvedValue(undefined);
      const first = renderHook(() => useCreateLockContent(params));
      const second = renderHook(() => useCreateLockContent(params));
      let firstPublish!: ReturnType<typeof first.result.current.publish>;
      let secondPublish!: ReturnType<typeof second.result.current.publish>;
      await act(async () => {
        firstPublish = first.result.current.publish();
        secondPublish = second.result.current.publish();
      });
      expect(mocks.create).toHaveBeenCalledTimes(2);
      first.unmount();
      await act(async () => {
        active.reject(rejectedSession());
        expect(await secondPublish).toEqual({ status: 'auth-expired' });
      });
      expect(useLocksAuthStore.getState().session).toBeNull();
      const auth = renderHook(() => useLocksAuthFlow());
      await act(async () => {
        await auth.result.current.start();
      });
      const state = mocks.connect.mock.calls[0][0].state;
      const iframe = document.createElement('iframe');
      Object.defineProperty(iframe, 'contentWindow', { value: window, configurable: true });
      auth.result.current.iframeRef.current = iframe;
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'locks-auth-callback', code: 'CODE', state },
            origin: 'https://lock.server',
            source: window,
          }),
        );
      });
      expect(mocks.exchange).toHaveBeenCalledOnce();
      expect(auth.result.current.status).toBe(LocksAuthFlowStatus.EXCHANGING);
      if (rejectionTiming === 'after') {
        await act(async () => {
          exchange.resolve({ session: newSession, secret: 'new-secret' });
        });
        expect(auth.result.current.status).toBe(LocksAuthFlowStatus.SUCCESS);
      }
      await act(async () => {
        abandoned.reject(rejectedSession());
        expect(await firstPublish).toEqual({ status: 'auth-expired' });
        exchange.resolve({ session: newSession, secret: 'new-secret' });
      });
      expect(auth.result.current.status).toBe(LocksAuthFlowStatus.SUCCESS);
      expect(auth.result.current.session).toBe(newSession);
      expect(useLocksAuthStore.getState().session).toBe(newSession);
      expect(useLocksAuthStore.getState().locksSessionSecret).toBe('new-secret');
      expect(mocks.config).toHaveBeenCalledOnce();
    },
  );
});
