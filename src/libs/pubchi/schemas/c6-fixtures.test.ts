import { describe, expect, it } from 'vitest';
import { parsePubchiAnswerV1 } from './answer';
import type { ErrorCode } from './codes';

const validFixtures = import.meta.glob('./__fixtures__/c6/valid/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
const invalidFixtures = import.meta.glob('./__fixtures__/c6/invalid/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function fixtureBasename(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

function expectedInvalidCode(name: string): ErrorCode {
  if (name.includes('attachments')) return 'UNKNOWN_FIELD';
  return 'SCHEMA_INVALID';
}

describe('C6 draft-post fixtures', () => {
  for (const [path, fixture] of Object.entries(validFixtures)) {
    it(`accepts ${fixtureBasename(path)}`, () => {
      expect(parsePubchiAnswerV1(fixture)).toMatchObject({ ok: true });
    });
  }

  for (const [path, fixture] of Object.entries(invalidFixtures)) {
    const name = fixtureBasename(path);
    it(`rejects ${name} as ${expectedInvalidCode(name)}`, () => {
      expect(parsePubchiAnswerV1(fixture)).toMatchObject({ ok: false, code: expectedInvalidCode(name) });
    });
  }
});
