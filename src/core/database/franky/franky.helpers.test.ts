import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './franky';
import { clearDatabase } from './franky.helpers';
import { withIndexedDbRecovery } from './franky.recovery';

const mocks = vi.hoisted(() => ({
  isOpen: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
  backendDB: vi.fn(),
  clear: vi.fn(),
  otherClear: vi.fn(),
}));
vi.mock('@/database/franky/franky', () => ({
  db: {
    isOpen: mocks.isOpen,
    open: mocks.open,
    close: mocks.close,
    on: mocks.on,
    backendDB: mocks.backendDB,
    tables: [{ clear: mocks.clear }, { clear: mocks.otherClear }],
  },
}));

async function expectRecoveryResumed() {
  mocks.isOpen.mockReturnValue(true);
  const failure = new DOMException('Connection lost', 'UnknownError');
  const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('recovered');
  await expect(withIndexedDbRecovery(db, operation)).resolves.toBe('recovered');
  expect(operation).toHaveBeenCalledTimes(2);
}

describe('account database cleanup ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOpen.mockReturnValue(false);
    mocks.open.mockResolvedValue(undefined);
    mocks.clear.mockResolvedValue(undefined);
    mocks.otherClear.mockResolvedValue(undefined);
    mocks.backendDB.mockReturnValue({});
  });

  it('does not start cleanup for a superseded account', async () => {
    await clearDatabase(() => false);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('rechecks account ownership after the database finishes opening', async () => {
    const opened = Promise.withResolvers<void>();
    mocks.open.mockReturnValueOnce(opened.promise);
    let current = true;
    const cleanup = clearDatabase(() => current);
    current = false;
    opened.resolve();
    await cleanup;
    expect(mocks.clear).not.toHaveBeenCalled();
    await expectRecoveryResumed();
  });

  it('clears tables when the initiating account still owns cleanup', async () => {
    await clearDatabase(() => true);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
});

it('waits for every started clear before rejecting a partial cleanup', async () => {
  mocks.isOpen.mockReturnValue(true);
  const failure = new Error('first table failed');
  const remaining = Promise.withResolvers<void>();
  mocks.clear.mockRejectedValueOnce(failure);
  mocks.otherClear.mockReturnValueOnce(remaining.promise);
  let finished = false;
  const cleanup = clearDatabase().catch((error: unknown) => {
    finished = true;
    return error;
  });
  await vi.waitFor(() => expect(mocks.otherClear).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const finishedBeforeRemainingClear = finished;
  remaining.resolve();
  expect(await cleanup).toBe(failure);
  expect(finishedBeforeRemainingClear).toBe(false);
  await expectRecoveryResumed();
});
