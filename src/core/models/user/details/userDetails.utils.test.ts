import { describe, expect, it } from 'vitest';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import type { UserDetailsModelSchema } from './userDetails.schema';
import { canReplaceUserDetails } from './userDetails.utils';

const PENDING_EDIT_MS = 300_000;
const EDITED_AT = 1_000;

const payload = (overrides: Partial<NexusUserDetails> = {}): NexusUserDetails => ({
  id: 'user-id',
  name: 'Name',
  bio: 'Bio',
  image: 'pubky://user-id/pub/pubky.app/files/NEW',
  links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
  status: 'working',
  indexed_at: 200,
  ...overrides,
});

/** A row holding a known Nexus revision (100) and no local edit. */
const indexedRow = (overrides: Partial<UserDetailsModelSchema> = {}): UserDetailsModelSchema => ({
  ...payload({ indexed_at: 100 }),
  nexusIndexedAt: 100,
  ...overrides,
});

/** The row right after the user published `payload()` on top of revision 100. */
const pendingRow = (overrides: Partial<UserDetailsModelSchema> = {}) =>
  indexedRow({ indexed_at: EDITED_AT, localUpdatedAt: EDITED_AT, ...overrides });

const canReplace = (
  existing: UserDetailsModelSchema | null,
  incoming: NexusUserDetails,
  { responseStartedAt = EDITED_AT + 500, now = EDITED_AT + 1_000 }: { responseStartedAt?: number; now?: number } = {},
) => canReplaceUserDetails({ existing, incoming, responseStartedAt, now, pendingEditMs: PENDING_EDIT_MS });

describe('canReplaceUserDetails', () => {
  describe('without a pending local edit', () => {
    it('accepts any payload when there is no cached row', () => {
      expect(canReplace(null, payload())).toBe(true);
    });

    it('accepts the same or a newer revision', () => {
      expect(canReplace(indexedRow(), payload({ indexed_at: 100 }))).toBe(true);
      expect(canReplace(indexedRow(), payload({ indexed_at: 200 }))).toBe(true);
    });

    it('rejects an older revision', () => {
      expect(canReplace(indexedRow(), payload({ indexed_at: 99 }))).toBe(false);
    });

    it('accepts any revision over a legacy row with no known revision', () => {
      expect(canReplace(indexedRow({ nexusIndexedAt: undefined }), payload({ indexed_at: 1 }))).toBe(true);
    });
  });

  describe('while a local edit is pending', () => {
    it('accepts a response that started after the edit, advanced the revision and includes the edit', () => {
      expect(canReplace(pendingRow(), payload())).toBe(true);
    });

    it('rejects an intermediate revision that does not include the edit', () => {
      expect(canReplace(pendingRow(), payload({ image: 'pubky://user-id/pub/pubky.app/files/OLD' }))).toBe(false);
    });

    it('rejects a matching response that started before the edit', () => {
      expect(canReplace(pendingRow(), payload(), { responseStartedAt: EDITED_AT - 1 })).toBe(false);
    });

    it('rejects a response with an unknown start time', () => {
      expect(
        canReplaceUserDetails({
          existing: pendingRow(),
          incoming: payload(),
          responseStartedAt: undefined,
          now: EDITED_AT + 1_000,
          pendingEditMs: PENDING_EDIT_MS,
        }),
      ).toBe(false);
    });

    it('rejects the already known revision even when it matches after an A → B → A edit', () => {
      // Revision 100 published `working`; the user switched to `building` and back to `working`.
      expect(canReplace(pendingRow(), payload({ indexed_at: 100 }))).toBe(false);
    });

    it('rejects an older revision', () => {
      expect(canReplace(pendingRow(), payload({ indexed_at: 99 }))).toBe(false);
    });

    it('accepts the first matching revision over a profile created locally', () => {
      expect(canReplace(pendingRow({ nexusIndexedAt: undefined }), payload({ indexed_at: 5 }))).toBe(true);
    });

    it('treats empty and missing optional fields as equal', () => {
      const row = pendingRow({ bio: '', image: null, links: null, status: null });

      expect(canReplace(row, payload({ bio: '', image: null, links: [], status: '' }))).toBe(true);
    });

    it('compares links in order', () => {
      const links = [
        { title: 'WEBSITE', url: 'https://example.com/' },
        { title: 'GITHUB', url: 'https://github.com/example' },
      ];

      expect(canReplace(pendingRow({ links }), payload({ links: [...links].reverse() }))).toBe(false);
    });
  });

  describe('after the pending window', () => {
    const now = EDITED_AT + PENDING_EDIT_MS;

    it('accepts a newer revision even when it does not include the edit', () => {
      expect(canReplace(pendingRow(), payload({ status: 'away' }), { now })).toBe(true);
    });

    it('still rejects an older revision', () => {
      expect(canReplace(pendingRow(), payload({ indexed_at: 99 }), { now })).toBe(false);
    });
  });
});
