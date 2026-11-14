import { z } from 'zod';

/**
 * Why the migration gate signed this tab out, kept in `sessionStorage` so `/migration` can explain
 * it after the logout reset every store, a reload of that tab included. While it is pending,
 * `RouteGuardProvider` routes the signed-out tab to the explanation from every page but sign-in,
 * logout and the legal ones: the cut-over worker's takeover reloads a tab to its creation URL
 * (`/home`, say), not to the route the gate had moved it to (ADR-0021 amendment). Tab-scoped like
 * the mute sync cursors; cleared when the user leaves the explanation (Sign in, Homepage, the header
 * logo), when a gate's engine run passes, and by the guard once the tab is signed in.
 */
const SIGNED_OUT_NOTICE_KEY = 'social-migration:signed-out';

const noticeSchema = z.object({
  reason: z.enum(['pre-migration-grant', 'missing-scopes', 'session-expired']),
});

export type SocialMigrationSignedOutNotice = z.infer<typeof noticeSchema>;

export function writeSocialMigrationSignedOutNotice(notice: SocialMigrationSignedOutNotice): void {
  try {
    sessionStorage.setItem(SIGNED_OUT_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Private mode / access errors: the page falls back to its generic explanation.
  }
}

export function readSocialMigrationSignedOutNotice(): SocialMigrationSignedOutNotice | null {
  try {
    const raw = sessionStorage.getItem(SIGNED_OUT_NOTICE_KEY);
    if (raw === null) return null;
    const parsed = noticeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearSocialMigrationSignedOutNotice(): void {
  try {
    sessionStorage.removeItem(SIGNED_OUT_NOTICE_KEY);
  } catch {
    // Nothing to clear.
  }
}
