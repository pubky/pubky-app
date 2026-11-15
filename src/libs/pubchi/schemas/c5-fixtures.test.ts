import { describe, expect, it } from 'vitest';
import { isCanonicalPublicEvidenceUri, parsePubchiAnswerV1 } from './answer';
import { parsePubchiAskBody, PubchiAskBodySchema } from './ask-body';

const validFixtures = import.meta.glob('./__fixtures__/c5/valid/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
const invalidFixtures = import.meta.glob('./__fixtures__/c5/invalid/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function fixtureBasename(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

describe('vendored C5 fixtures', () => {
  for (const [path, fixture] of Object.entries(validFixtures)) {
    it(`accepts ${fixtureBasename(path)}`, () => {
      const name = fixtureBasename(path);
      if (name.startsWith('ask-body__')) {
        expect(parsePubchiAskBody(fixture)).toMatchObject({ ok: true });
        return;
      }
      if (name.startsWith('answer__')) {
        expect(parsePubchiAnswerV1(fixture)).toMatchObject({ ok: true });
        return;
      }
      throw new Error(`unexpected valid C5 fixture: ${name}`);
    });
  }

  for (const [path, fixture] of Object.entries(invalidFixtures)) {
    it(`rejects ${fixtureBasename(path)}`, () => {
      const name = fixtureBasename(path);
      if (name.startsWith('ask-body__')) {
        expect(PubchiAskBodySchema.safeParse(fixture).success, `${name} must fail PubchiAskBodySchema`).toBe(false);
        return;
      }
      if (name.startsWith('answer__')) {
        expect(parsePubchiAnswerV1(fixture).ok, `${name} must fail parsePubchiAnswerV1`).toBe(false);
        return;
      }
      throw new Error(`unexpected invalid C5 fixture: ${name}`);
    });
  }

  it.each([
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/ABC',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/other.app/deep/path',
  ])('accepts canonical public evidence URI %s', (uri) => {
    expect(isCanonicalPublicEvidenceUri(uri)).toBe(true);
  });

  it.each([
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/ABC?query=x',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/ABC#fragment',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/../posts/ABC',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app//posts/ABC',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/ABC/',
    'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/%41BC',
  ])('rejects a noncanonical public evidence URI %s', (uri) => {
    expect(isCanonicalPublicEvidenceUri(uri)).toBe(false);
  });
});
