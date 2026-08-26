import validationLimits from 'pubky-app-specs/validationLimits.json';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import { FeedValidators } from './feed.validators';

describe('FeedValidators.sanitizeIcon', () => {
  // Specs rejects an empty icon, one over `feedIconMaxLength`, and one with
  // characters outside `[a-z0-9-]`, and `createFeed` throws on rejection —
  // during bootstrap that throw is caught per-feed, so an unusable icon would
  // drop the whole feed from the nav.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a name over the specs length limit', 'x'.repeat(validationLimits.feedIconMaxLength + 1)],
    ['a snake_case name outside the specs charset', 'favorite_border'],
    ['a name with inner whitespace', 'alarm clock'],
    ['a name with punctuation outside the specs charset', 'icon.name'],
    ['an emoji', '🔥'],
  ])('falls back to the default icon for %s', (_label, input) => {
    expect(FeedValidators.sanitizeIcon(input)).toBe(DEFAULT_CUSTOM_FEED_ICON);
  });

  it('keeps a valid icon name', () => {
    expect(FeedValidators.sanitizeIcon('mountain')).toBe('mountain');
  });

  it('trims surrounding whitespace', () => {
    expect(FeedValidators.sanitizeIcon('  mountain  ')).toBe('mountain');
  });

  it('keeps a name at exactly the length limit', () => {
    const atLimit = 'x'.repeat(validationLimits.feedIconMaxLength);

    expect(FeedValidators.sanitizeIcon(atLimit)).toBe(atLimit);
  });

  it('normalizes case so the stored name is the one the UI can resolve', () => {
    // The UI's `toLucideIconName` only resolves lowercase kebab names, so an
    // icon another client wrote as `Activity` must be stored lowercased —
    // otherwise the tab would silently render the fallback glyph.
    expect(FeedValidators.sanitizeIcon('Activity')).toBe('activity');
    expect(FeedValidators.sanitizeIcon('Circle-Alert')).toBe('circle-alert');
  });

  it("passes through a name we do not recognise so another client's icon set survives a round-trip", () => {
    expect(FeedValidators.sanitizeIcon('some-other-client-icon')).toBe('some-other-client-icon');
  });
});
