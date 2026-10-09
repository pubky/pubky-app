import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDatabase } from './franky.helpers';

const mocks = vi.hoisted(() => ({ isOpen: vi.fn(), open: vi.fn(), clear: vi.fn(), otherClear: vi.fn() }));
vi.mock('@/database/franky/franky', () => ({
  db: { isOpen: mocks.isOpen, open: mocks.open, tables: [{ clear: mocks.clear }, { clear: mocks.otherClear }] },
}));

describe('account database cleanup ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOpen.mockReturnValue(false);
    mocks.open.mockResolvedValue(undefined);
    mocks.clear.mockResolvedValue(undefined);
    mocks.otherClear.mockResolvedValue(undefined);
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
});
