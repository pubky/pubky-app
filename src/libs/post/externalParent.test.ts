import { describe, expect, it } from 'vitest';
import { getExternalParentProblem, isExternalParentUri } from './externalParent';

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
