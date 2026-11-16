import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePurchasedLocks } from '@/hooks/usePurchasedLocks/usePurchasedLocks';
import { usePurchaseResume } from '@/hooks/usePurchaseResume/usePurchaseResume';
import type { LockFile } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import type { FocusedLock } from './FocusedLockContext';
import { FocusedLockRecovery } from './FocusedLockRecovery';

vi.mock('@/hooks/usePurchasedLocks/usePurchasedLocks', () => ({ usePurchasedLocks: vi.fn() }));
vi.mock('@/hooks/usePurchaseResume/usePurchaseResume', () => ({ usePurchaseResume: vi.fn(() => 'none') }));

const LOCK_URL = 'pubky://hs/pub/app.locks/lock1.json';
const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
const hasPurchase = vi.fn((lockId: string | null) => lockId === 'lock1');

const focusedLock = (overrides: Partial<FocusedLock['unlocked']> = {}): FocusedLock => ({
  postId: 'pubkybob:POST1',
  lock: LOCK_URL,
  lockFile: { lockFile, price: { amount: '1000', asset: 'BTC' }, isLoading: false },
  unlocked: {
    unlockedPost: { content: '{"title":"T","body":"B"}', kind: 'long', attachments: null },
    applyUnlockedContent: vi.fn(),
    media: [],
    pendingAttachments: [],
    hasCompleteContent: false,
    isOwnLock: false,
    isResolvingOwn: false,
    isResolvingReplica: false,
    ...overrides,
  },
});

describe('FocusedLockRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePurchasedLocks).mockReturnValue({ hasPurchase, markPurchased: vi.fn(), status: 'ready' });
  });

  it('re-downloads a listed purchase whose bytes are unreadable, into the page state', () => {
    const value = focusedLock();

    const { container } = render(<FocusedLockRecovery focusedLock={value} />);

    expect(container).toBeEmptyDOMElement();
    expect(usePurchasedLocks).toHaveBeenCalledWith({ enabled: true });
    expect(usePurchaseResume).toHaveBeenCalledWith({
      lock: LOCK_URL,
      lockFile,
      isPurchased: true,
      hasContent: false,
      isResolvingContent: false,
      onResumed: value.unlocked.applyUnlockedContent,
    });
  });

  it('tells the recovery the content is complete, so a received purchase is not downloaded again', () => {
    render(<FocusedLockRecovery focusedLock={focusedLock({ hasCompleteContent: true })} />);

    expect(usePurchaseResume).toHaveBeenCalledWith(expect.objectContaining({ hasContent: true }));
  });
});
