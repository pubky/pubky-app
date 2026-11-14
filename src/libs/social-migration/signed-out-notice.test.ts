import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSocialMigrationSignedOutNotice,
  readSocialMigrationSignedOutNotice,
  writeSocialMigrationSignedOutNotice,
} from './signed-out-notice';

describe('social migration signed-out notice', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips a reason through session storage and clears it', () => {
    expect(readSocialMigrationSignedOutNotice()).toBeNull();
    writeSocialMigrationSignedOutNotice({ reason: 'session-expired' });
    expect(readSocialMigrationSignedOutNotice()).toEqual({ reason: 'session-expired' });
    expect(localStorage.getItem('social-migration:signed-out')).toBeNull();
    clearSocialMigrationSignedOutNotice();
    expect(readSocialMigrationSignedOutNotice()).toBeNull();
  });

  it('ignores an unknown reason or a corrupt entry', () => {
    sessionStorage.setItem('social-migration:signed-out', JSON.stringify({ reason: 'other' }));
    expect(readSocialMigrationSignedOutNotice()).toBeNull();
    sessionStorage.setItem('social-migration:signed-out', '{');
    expect(readSocialMigrationSignedOutNotice()).toBeNull();
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => writeSocialMigrationSignedOutNotice({ reason: 'missing-scopes' })).not.toThrow();
    expect(readSocialMigrationSignedOutNotice()).toBeNull();
    expect(() => clearSocialMigrationSignedOutNotice()).not.toThrow();
    vi.restoreAllMocks();
  });
});
