import { describe, expect, it } from 'vitest';
import { LocksApplication } from './locks';

describe('LocksApplication.fetchLockFile', () => {
  it('throws a validation error for a malformed lock url (the single failure origin)', async () => {
    await expect(LocksApplication.fetchLockFile({ lockUrl: 'https://example.com/lock.json' })).rejects.toThrow();
  });
});
