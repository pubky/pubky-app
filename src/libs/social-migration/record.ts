import { z } from 'zod';
import { SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';

/**
 * The gate's per-account localStorage record (ADR-0026): the transform revision this browser saw
 * the done flag at (so a restore passes with no network and no migrator chunk), the grants this
 * build admitted (so a reload mid-run resumes instead of being signed out again), where the last
 * run stopped, and the counts of what it left behind. Never Dexie (cleared by account preparation,
 * logout and a `DB_VERSION` bump, before the gate runs) and never the homeserver (the flag there
 * is the authority; this record exists to avoid asking). Excluded from the logout sweep like
 * `auth-store-v3-migrated`. An unreadable record is `null` and never trusted.
 */
export const SOCIAL_MIGRATION_RECORD_KEY_PREFIX = 'social-migration:';

/** Grants this build admitted, newest last; a browser that signs in this often has nothing to resume. */
const ADMITTED_GRANTS_KEPT = 8;

const countsSchema = z.record(z.string(), z.number().int().nonnegative());

const socialMigrationRecordSchema = z.object({
  v: z.literal(1),
  migratedRev: z.number().int().nonnegative().optional(),
  admittedGrantIds: z.array(z.string().min(1)),
  lastRun: z
    .object({
      at: z.number().finite(),
      status: z.string(),
      phase: z.string().optional(),
      pass: z.string().optional(),
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      counts: countsSchema,
      dropped: z.number().int().nonnegative(),
      error: z.object({ code: z.string(), needBytes: z.number().nonnegative().optional() }).optional(),
    })
    .optional(),
  notice: z
    .object({
      skipped: countsSchema,
      profileImage: z.number().int().nonnegative(),
      profileLinks: z.number().int().nonnegative(),
      pending: z.boolean(),
    })
    .optional(),
});

export type SocialMigrationRecord = z.infer<typeof socialMigrationRecordSchema>;

const emptySocialMigrationRecord = (): SocialMigrationRecord => ({ v: 1, admittedGrantIds: [] });

export function socialMigrationRecordKey(pubky: string): string {
  return `${SOCIAL_MIGRATION_RECORD_KEY_PREFIX}${pubky}`;
}

export function readSocialMigrationRecord(pubky: string): SocialMigrationRecord | null {
  try {
    const raw = localStorage.getItem(socialMigrationRecordKey(pubky));
    if (raw === null) return null;
    const parsed = socialMigrationRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Private mode, blocked storage or a corrupt entry: an untrusted record asks the homeserver.
    return null;
  }
}

/** Best effort: a browser that refuses the write asks the homeserver again next time. */
export function writeSocialMigrationRecord(pubky: string, record: SocialMigrationRecord): void {
  try {
    localStorage.setItem(socialMigrationRecordKey(pubky), JSON.stringify(record));
  } catch {
    // Quota or access error; nothing to do.
  }
}

export function updateSocialMigrationRecord(
  pubky: string,
  update: (record: SocialMigrationRecord) => SocialMigrationRecord,
): SocialMigrationRecord {
  const next = update(readSocialMigrationRecord(pubky) ?? emptySocialMigrationRecord());
  writeSocialMigrationRecord(pubky, next);
  return next;
}

/** A restore trusts the record only when it saw the flag at this build's revision or a later one. */
export function isSocialMigrationRecordTrusted(record: SocialMigrationRecord | null): boolean {
  return record?.migratedRev !== undefined && record.migratedRev >= SOCIAL_MIGRATION_TRANSFORM_REV;
}

export function admitSocialMigrationGrant(pubky: string, grantId: string): void {
  updateSocialMigrationRecord(pubky, (record) => ({
    ...record,
    admittedGrantIds: [...record.admittedGrantIds.filter((id) => id !== grantId), grantId].slice(-ADMITTED_GRANTS_KEPT),
  }));
}

export function isSocialMigrationGrantAdmitted(record: SocialMigrationRecord | null, grantId: string | null): boolean {
  return grantId !== null && (record?.admittedGrantIds.includes(grantId) ?? false);
}

/** The flag was seen at `rev`; the record only moves forward. */
export function markSocialMigrated(pubky: string, rev: number): void {
  updateSocialMigrationRecord(pubky, (record) => ({
    ...record,
    migratedRev: Math.max(record.migratedRev ?? 0, rev),
    lastRun: undefined,
  }));
}

/** The profile values a finished run dropped, for the one-shot note on the profile edit page (D17). */
export type SocialMigrationProfileNotice = Pick<
  NonNullable<SocialMigrationRecord['notice']>,
  'profileImage' | 'profileLinks'
>;

/** `null` once the note was acknowledged, and when the run dropped no profile value (only skipped items). */
export function readPendingSocialMigrationProfileNotice(pubky: string): SocialMigrationProfileNotice | null {
  const notice = readSocialMigrationRecord(pubky)?.notice;
  if (!notice?.pending || (notice.profileImage === 0 && notice.profileLinks === 0)) return null;
  return { profileImage: notice.profileImage, profileLinks: notice.profileLinks };
}

/** The note does not show again; the counts stay. A record without a pending notice is left as it is, never created. */
export function acknowledgeSocialMigrationProfileNotice(pubky: string): void {
  const record = readSocialMigrationRecord(pubky);
  if (!record?.notice?.pending) return;
  writeSocialMigrationRecord(pubky, { ...record, notice: { ...record.notice, pending: false } });
}
