import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import { PERSISTED_STORE_KEYS } from '@/stores/persistedKeys';
import {
  acknowledgeSocialMigrationProfileNotice,
  admitSocialMigrationGrant,
  isSocialMigrationGrantAdmitted,
  isSocialMigrationRecordTrusted,
  markSocialMigrated,
  readPendingSocialMigrationProfileNotice,
  readSocialMigrationRecord,
  SOCIAL_MIGRATION_RECORD_KEY_PREFIX,
  socialMigrationRecordKey,
  updateSocialMigrationRecord,
  writeSocialMigrationRecord,
} from './record';

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

describe('social migration record', () => {
  beforeEach(() => localStorage.clear());

  it('is keyed per account and stays out of the logout sweep', () => {
    expect(socialMigrationRecordKey(PUBKY)).toBe(`social-migration:${PUBKY}`);
    expect(PERSISTED_STORE_KEYS.some((key) => key.startsWith(SOCIAL_MIGRATION_RECORD_KEY_PREFIX))).toBe(false);
  });

  it('reads nothing for an absent, corrupt or foreign-shaped entry', () => {
    expect(readSocialMigrationRecord(PUBKY)).toBeNull();
    localStorage.setItem(socialMigrationRecordKey(PUBKY), '{not json');
    expect(readSocialMigrationRecord(PUBKY)).toBeNull();
    localStorage.setItem(socialMigrationRecordKey(PUBKY), JSON.stringify({ v: 2, admittedGrantIds: [] }));
    expect(readSocialMigrationRecord(PUBKY)).toBeNull();
    localStorage.setItem(socialMigrationRecordKey(PUBKY), JSON.stringify({ v: 1, admittedGrantIds: 'grant' }));
    expect(readSocialMigrationRecord(PUBKY)).toBeNull();
  });

  it('reads nothing when storage throws, and swallows a failed write', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readSocialMigrationRecord(PUBKY)).toBeNull();
    read.mockRestore();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => writeSocialMigrationRecord(PUBKY, { v: 1, admittedGrantIds: [] })).not.toThrow();
    write.mockRestore();
  });

  it('trusts a record only at this build revision or above', () => {
    expect(isSocialMigrationRecordTrusted(null)).toBe(false);
    expect(isSocialMigrationRecordTrusted({ v: 1, admittedGrantIds: [] })).toBe(false);
    expect(
      isSocialMigrationRecordTrusted({ v: 1, admittedGrantIds: [], migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV - 1 }),
    ).toBe(false);
    expect(
      isSocialMigrationRecordTrusted({ v: 1, admittedGrantIds: [], migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV }),
    ).toBe(true);
    expect(
      isSocialMigrationRecordTrusted({ v: 1, admittedGrantIds: [], migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV + 1 }),
    ).toBe(true);
  });

  it('only moves the migrated revision forward and drops the last run with it', () => {
    writeSocialMigrationRecord(PUBKY, {
      v: 1,
      admittedGrantIds: ['a'],
      lastRun: { at: 1, status: 'running', done: 1, total: 2, counts: {}, dropped: 0 },
    });
    markSocialMigrated(PUBKY, 5);
    expect(readSocialMigrationRecord(PUBKY)).toEqual({ v: 1, admittedGrantIds: ['a'], migratedRev: 5 });
    markSocialMigrated(PUBKY, 3);
    expect(readSocialMigrationRecord(PUBKY)?.migratedRev).toBe(5);
  });

  it('admits grants newest last, once each, and keeps a bounded list', () => {
    for (let i = 0; i < 10; i++) admitSocialMigrationGrant(PUBKY, `grant-${i}`);
    admitSocialMigrationGrant(PUBKY, 'grant-5');
    const record = readSocialMigrationRecord(PUBKY);
    expect(record?.admittedGrantIds).toHaveLength(8);
    expect(record?.admittedGrantIds.at(-1)).toBe('grant-5');
    expect(record?.admittedGrantIds.filter((id) => id === 'grant-5')).toHaveLength(1);
    expect(isSocialMigrationGrantAdmitted(record, 'grant-9')).toBe(true);
    expect(isSocialMigrationGrantAdmitted(record, 'grant-0')).toBe(false);
    expect(isSocialMigrationGrantAdmitted(record, null)).toBe(false);
    expect(isSocialMigrationGrantAdmitted(null, 'grant-9')).toBe(false);
  });

  it('updates from an empty record when none is stored', () => {
    const next = updateSocialMigrationRecord(PUBKY, (record) => ({ ...record, migratedRev: 1 }));
    expect(next).toEqual({ v: 1, admittedGrantIds: [], migratedRev: 1 });
    expect(readSocialMigrationRecord(PUBKY)).toEqual(next);
  });

  describe('profile notice', () => {
    const withNotice = (notice: { profileImage: number; profileLinks: number; pending: boolean }) =>
      writeSocialMigrationRecord(PUBKY, {
        v: 1,
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: ['grant-1'],
        notice: { skipped: { malformed: 2 }, ...notice },
      });

    it('reads the dropped profile values while the notice is pending', () => {
      withNotice({ profileImage: 1, profileLinks: 2, pending: true });
      expect(readPendingSocialMigrationProfileNotice(PUBKY)).toEqual({ profileImage: 1, profileLinks: 2 });
    });

    it('reads nothing without a record, once acknowledged, or when only items were skipped', () => {
      expect(readPendingSocialMigrationProfileNotice(PUBKY)).toBeNull();
      withNotice({ profileImage: 1, profileLinks: 0, pending: false });
      expect(readPendingSocialMigrationProfileNotice(PUBKY)).toBeNull();
      withNotice({ profileImage: 0, profileLinks: 0, pending: true });
      expect(readPendingSocialMigrationProfileNotice(PUBKY)).toBeNull();
    });

    it('acknowledges by clearing pending only, keeping the counts and the rest of the record', () => {
      withNotice({ profileImage: 1, profileLinks: 1, pending: true });
      acknowledgeSocialMigrationProfileNotice(PUBKY);
      expect(readSocialMigrationRecord(PUBKY)).toEqual({
        v: 1,
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: ['grant-1'],
        notice: { skipped: { malformed: 2 }, profileImage: 1, profileLinks: 1, pending: false },
      });
      expect(readPendingSocialMigrationProfileNotice(PUBKY)).toBeNull();
    });

    it('never creates a record or a notice when acknowledging', () => {
      acknowledgeSocialMigrationProfileNotice(PUBKY);
      expect(localStorage.getItem(socialMigrationRecordKey(PUBKY))).toBeNull();
      writeSocialMigrationRecord(PUBKY, { v: 1, admittedGrantIds: [] });
      acknowledgeSocialMigrationProfileNotice(PUBKY);
      expect(readSocialMigrationRecord(PUBKY)).toEqual({ v: 1, admittedGrantIds: [] });
    });
  });
});
