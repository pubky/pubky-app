import { describe, expect, it } from 'vitest';
import { foldWebLink, getExternalParentProblem, isExternalParentUri } from './externalParent';
import vectors from './fixtures/webTarget.vectors.json';

describe('isExternalParentUri', () => {
  it.each(['https://stacker.news/items/123', 'isbn:9780131103627', 'geo:47.37,8.54'])('takes %s', (uri) => {
    expect(isExternalParentUri(uri)).toBe(true);
    expect(getExternalParentProblem(uri)).toBeNull();
  });

  it.each([
    [
      'pubky://3jubjyq4fkh4dq38exrpuo8we6xta8a6rhxnjjzyoo7j4r3f4rjo/pub/loopky/decks/icvetu0ujilj/manifest.json',
      'has an unsupported scheme',
    ],
    ['HTTPS://example.com', 'has an unsupported scheme'],
    ['https://example.com/a b', 'is empty or has spaces'],
    ['https://', 'has no host'],
    ['doi:', 'names nothing'],
  ])('refuses %s: %s', (uri, problem) => {
    expect(isExternalParentUri(uri)).toBe(false);
    expect(getExternalParentProblem(uri)).toBe(problem);
  });
});

describe('foldWebLink', () => {
  // The pubky-social-specs writer helper's vectors (`vectors/web_target.json`), copied as they are.
  it.each(vectors.fold.map((vector) => [vector.rule, vector.in, vector.out]))('%s: %j', (_rule, link, folded) => {
    expect(foldWebLink(link)).toBe(folded);
    // A folded link folds to itself, and a post can name it.
    expect(foldWebLink(folded)).toBe(folded);
    expect(isExternalParentUri(folded)).toBe(true);
  });

  it.each(vectors.refused.map((vector) => [vector.rule, vector.in]))('refuses %s: %j', (_rule, link) => {
    expect(foldWebLink(link)).toBeNull();
  });

  it('refuses a link the fold would take past the length limit a post can name', () => {
    const atLimit = `https://example.com?q=${'a'.repeat(1024 - 'https://example.com?q='.length)}`;
    expect(isExternalParentUri(atLimit)).toBe(true);
    expect(foldWebLink(atLimit)).toBeNull();
    expect(foldWebLink(`https://example.com/?q=${'a'.repeat(1001)}`)).toHaveLength(1024);
  });
});
