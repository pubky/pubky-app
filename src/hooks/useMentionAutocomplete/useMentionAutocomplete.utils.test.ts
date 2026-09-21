import { describe, expect, it } from 'vitest';
import { extractMentionQuery, getContentWithMention } from './useMentionAutocomplete.utils';

describe('extractMentionQuery', () => {
  describe('@ pattern extraction', () => {
    it('returns null atQuery for content without @ pattern at end', () => {
      const result = extractMentionQuery('Hello world');
      expect(result.atQuery).toBeNull();
    });

    it('returns null atQuery when @ has no characters after it', () => {
      const result = extractMentionQuery('Hello @');
      expect(result.atQuery).toBeNull();
    });

    it('returns null atQuery when @ has only 1 character (below minimum)', () => {
      const result = extractMentionQuery('Hello @a');
      expect(result.atQuery).toBeNull();
    });

    it('extracts @ query with exactly 2 characters (minimum)', () => {
      const result = extractMentionQuery('Hello @ab');
      expect(result.atQuery).toBe('ab');
    });

    it('extracts @ query with more than 2 characters', () => {
      const result = extractMentionQuery('Hello @john');
      expect(result.atQuery).toBe('john');
    });

    it('only extracts the @ query at the end', () => {
      const result = extractMentionQuery('Hello @alice and @bob');
      expect(result.atQuery).toBe('bob');
    });

    it('handles @ at the start of content', () => {
      const result = extractMentionQuery('@john');
      expect(result.atQuery).toBe('john');
    });

    it('returns null when @ pattern is not at the end', () => {
      const result = extractMentionQuery('@john is here');
      expect(result.atQuery).toBeNull();
    });

    it('handles special characters in username', () => {
      const result = extractMentionQuery('Hello @john_doe-123');
      expect(result.atQuery).toBe('john_doe-123');
    });
  });

  describe('pk: pattern extraction (legacy backwards compat)', () => {
    it('returns null pkQuery for content without pk: pattern at end', () => {
      const result = extractMentionQuery('Hello world');
      expect(result.pkQuery).toBeNull();
    });

    it('returns null pkQuery when pk: has no characters after it', () => {
      const result = extractMentionQuery('Hello pk:');
      expect(result.pkQuery).toBeNull();
    });

    it('returns null pkQuery when pk: has only 1 character (below minimum)', () => {
      const result = extractMentionQuery('Hello pk:a');
      expect(result.pkQuery).toBeNull();
    });

    it('returns null pkQuery when pk: has only 2 characters (below minimum)', () => {
      const result = extractMentionQuery('Hello pk:ab');
      expect(result.pkQuery).toBeNull();
    });

    it('extracts pk: query with exactly 3 characters (minimum)', () => {
      const result = extractMentionQuery('Hello pk:abc');
      expect(result.pkQuery).toBe('abc');
    });

    it('extracts pk: query with more than 3 characters', () => {
      const result = extractMentionQuery('Hello pk:abc123');
      expect(result.pkQuery).toBe('abc123');
    });

    it('only extracts the pk: query at the end', () => {
      const result = extractMentionQuery('Hello pk:user1 and pk:user2');
      expect(result.pkQuery).toBe('user2');
    });

    it('handles pk: at the start of content', () => {
      const result = extractMentionQuery('pk:user123');
      expect(result.pkQuery).toBe('user123');
    });

    it('returns null when pk: pattern is not at the end', () => {
      const result = extractMentionQuery('pk:user123 is here');
      expect(result.pkQuery).toBeNull();
    });
  });

  describe('pubky pattern extraction (new format)', () => {
    it('returns null pkQuery when pubky has no characters after it', () => {
      const result = extractMentionQuery('Hello pubky');
      expect(result.pkQuery).toBeNull();
    });

    it('returns null pkQuery when pubky has only 1 character (below minimum)', () => {
      const result = extractMentionQuery('Hello pubkya');
      expect(result.pkQuery).toBeNull();
    });

    it('returns null pkQuery when pubky has only 2 characters (below minimum)', () => {
      const result = extractMentionQuery('Hello pubkyab');
      expect(result.pkQuery).toBeNull();
    });

    it('extracts pubky query with exactly 3 characters (minimum)', () => {
      const result = extractMentionQuery('Hello pubkyabc');
      expect(result.pkQuery).toBe('abc');
    });

    it('extracts pubky query with more than 3 characters', () => {
      const result = extractMentionQuery('Hello pubkyabc123');
      expect(result.pkQuery).toBe('abc123');
    });

    it('only extracts the pubky query at the end', () => {
      const result = extractMentionQuery('Hello pubkyuser1 and pubkyuser2');
      expect(result.pkQuery).toBe('user2');
    });

    it('handles pubky at the start of content', () => {
      const result = extractMentionQuery('pubkyuser123');
      expect(result.pkQuery).toBe('user123');
    });

    it('returns null when pubky pattern is not at the end', () => {
      const result = extractMentionQuery('pubkyuser123 is here');
      expect(result.pkQuery).toBeNull();
    });
  });

  describe('complete pubkey filtering', () => {
    const completePubkey = 'o1gg96ewuojmopcjbz8895478wenhuj8okomrf4w6f97puo18t7o';

    it('filters out complete pubkey with pk: prefix (52 alphanumeric chars)', () => {
      const result = extractMentionQuery(`Hello pk:${completePubkey}`);
      expect(result.pkQuery).toBeNull();
    });

    it('filters out complete pubkey with pubky prefix (52 alphanumeric chars)', () => {
      const result = extractMentionQuery(`Hello pubky${completePubkey}`);
      expect(result.pkQuery).toBeNull();
    });

    it('filters out pubkey longer than 52 chars with pk:', () => {
      const longerPubkey = completePubkey + 'extra';
      const result = extractMentionQuery(`Hello pk:${longerPubkey}`);
      expect(result.pkQuery).toBeNull();
    });

    it('filters out pubkey longer than 52 chars with pubky', () => {
      const longerPubkey = completePubkey + 'extra';
      const result = extractMentionQuery(`Hello pubky${longerPubkey}`);
      expect(result.pkQuery).toBeNull();
    });

    it('keeps partial pubkey (less than 52 chars) with pk:', () => {
      const partialPubkey = 'o1gg96ewuojm';
      const result = extractMentionQuery(`Hello pk:${partialPubkey}`);
      expect(result.pkQuery).toBe(partialPubkey);
    });

    it('keeps partial pubkey (less than 52 chars) with pubky', () => {
      const partialPubkey = 'o1gg96ewuojm';
      const result = extractMentionQuery(`Hello pubky${partialPubkey}`);
      expect(result.pkQuery).toBe(partialPubkey);
    });

    it('keeps pubkey with non-alphanumeric characters even if 52+ chars', () => {
      // Contains uppercase - not a valid complete pubkey pattern
      const mixedCasePubkey = 'O1gg96ewuojmopcjbz8895478wenhuj8okomrf4w6f97puo18t7o';
      const result = extractMentionQuery(`Hello pk:${mixedCasePubkey}`);
      expect(result.pkQuery).toBe(mixedCasePubkey);
    });
  });

  describe('mixed @ and pubky patterns', () => {
    it('extracts only pk: when both present but only pk: is at absolute end', () => {
      // @john is NOT at the end - pk:user123 comes after it
      const result = extractMentionQuery('Hello @john pk:user123');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBe('user123');
    });

    it('extracts only pubky when both present but only pubky is at absolute end', () => {
      const result = extractMentionQuery('Hello @john pubkyuser123');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBe('user123');
    });

    it('extracts only pk: when @ is not at end', () => {
      const result = extractMentionQuery('@alice hello pk:user1');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBe('user1');
    });

    it('extracts only @ when pk: is not at end', () => {
      const result = extractMentionQuery('pk:user1 hello @bob');
      expect(result.atQuery).toBe('bob');
      expect(result.pkQuery).toBeNull();
    });

    it('extracts only @ when pubky is not at end', () => {
      const result = extractMentionQuery('pubkyuser1 hello @bob');
      expect(result.atQuery).toBe('bob');
      expect(result.pkQuery).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for both on empty string', () => {
      const result = extractMentionQuery('');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBeNull();
    });

    it('returns null for both on whitespace only', () => {
      const result = extractMentionQuery('   \n\t  ');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBeNull();
    });

    it('handles @ in email-like pattern at end', () => {
      const result = extractMentionQuery('contact email@example.com');
      // @example.com is at the end
      expect(result.atQuery).toBe('example.com');
    });

    it('does not match pubky: with colon (invalid format)', () => {
      // pubky: (with colon) is not the new format - should not match
      const result = extractMentionQuery('Hello pubky:abc123');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBeNull();
    });

    it('does not match pubky: alone', () => {
      const result = extractMentionQuery('Hello pubky:');
      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBeNull();
    });
  });

  describe('caret-anchored extraction', () => {
    it('extracts the @ query the caret sits in when text follows it', () => {
      // 'Hello @jo| world' - the caret is after '@jo'
      const result = extractMentionQuery('Hello @jo world', 9);

      expect(result.atQuery).toBe('jo');
      expect(result.range).toEqual({ start: 6, end: 9 });
    });

    it('extracts the partial username up to the caret mid-word', () => {
      // 'Hello @joh|n' - only the characters before the caret count as the query
      const result = extractMentionQuery('Hello @john', 10);

      expect(result.atQuery).toBe('joh');
      expect(result.range).toEqual({ start: 6, end: 10 });
    });

    it('ignores an @ pattern that starts after the caret', () => {
      // 'Hello |@john' - nothing typed at the caret yet
      const result = extractMentionQuery('Hello @john', 6);

      expect(result.atQuery).toBeNull();
      expect(result.range).toBeNull();
    });

    it('extracts the pk: query the caret sits in when text follows it', () => {
      const result = extractMentionQuery('Hello pk:abc world', 12);

      expect(result.pkQuery).toBe('abc');
      expect(result.range).toEqual({ start: 6, end: 12 });
    });

    it('ignores a pk: pattern that starts after the caret', () => {
      const result = extractMentionQuery('Hello pk:abc world', 6);

      expect(result.pkQuery).toBeNull();
      expect(result.range).toBeNull();
    });

    it('returns no range when the caret sits outside the pattern', () => {
      // 'Hello @jo |world' - the caret moved past the pattern's trailing space
      const result = extractMentionQuery('Hello @jo world', 10);

      expect(result.atQuery).toBeNull();
      expect(result.range).toBeNull();
    });

    it('keeps the pubky pattern as the range when both patterns end at the caret', () => {
      const result = extractMentionQuery('Hello @pubkyabc', 15);

      expect(result.atQuery).toBe('pubkyabc');
      expect(result.pkQuery).toBe('abc');
      expect(result.range).toEqual({ start: 7, end: 15 });
    });

    it('falls back to the end of the value when the caret is past it', () => {
      const result = extractMentionQuery('Hello @jo', 999);

      expect(result.atQuery).toBe('jo');
      expect(result.range).toEqual({ start: 6, end: 9 });
    });

    it('extracts nothing at the start of the value', () => {
      const result = extractMentionQuery('Hello @jo', 0);

      expect(result.atQuery).toBeNull();
      expect(result.pkQuery).toBeNull();
      expect(result.range).toBeNull();
    });
  });
});

describe('getContentWithMention', () => {
  const userId = 'abc123xyz';

  /** Selection made with the caret at the end of the value - the pre-#1959 behaviour */
  const atEnd = (content: string) => getContentWithMention(content, content.length, userId);

  describe('replaces @ pattern at end with pubky format', () => {
    it('replaces @username with pubky{userId}', () => {
      expect(atEnd('Hello @john').content).toBe(`Hello pubky${userId} `);
    });

    it('replaces partial @username with pubky{userId}', () => {
      expect(atEnd('Hello @jo').content).toBe(`Hello pubky${userId} `);
    });

    it('replaces @ alone with pubky{userId}', () => {
      expect(atEnd('Hello @').content).toBe(`Hello pubky${userId} `);
    });

    it('only replaces the @ pattern at the end', () => {
      expect(atEnd('@alice mentioned @bob').content).toBe(`@alice mentioned pubky${userId} `);
    });
  });

  describe('replaces pk: pattern at end with pubky format', () => {
    it('replaces pk:partial with pubky{userId}', () => {
      expect(atEnd('Hello pk:abc').content).toBe(`Hello pubky${userId} `);
    });

    it('replaces pk: alone with pubky{userId}', () => {
      expect(atEnd('Hello pk:').content).toBe(`Hello pubky${userId} `);
    });

    it('only replaces the pk: pattern at the end', () => {
      expect(atEnd('pk:user1 mentioned pk:user').content).toBe(`pk:user1 mentioned pubky${userId} `);
    });
  });

  describe('replaces pubky pattern at end', () => {
    it('replaces pubky{partial} with pubky{userId}', () => {
      expect(atEnd('Hello pubkyabc').content).toBe(`Hello pubky${userId} `);
    });

    it('only replaces the pubky pattern at the end', () => {
      expect(atEnd('pubkyuser1 mentioned pubkyuser').content).toBe(`pubkyuser1 mentioned pubky${userId} `);
    });
  });

  describe('pubky ID pattern takes precedence over @', () => {
    it('replaces pk: when both patterns present at end', () => {
      expect(atEnd('@john pk:abc').content).toBe(`@john pubky${userId} `);
    });

    it('replaces pubky when both patterns present at end', () => {
      expect(atEnd('@john pubkyabc').content).toBe(`@john pubky${userId} `);
    });
  });

  describe('fallback appends when no pattern at end', () => {
    it('appends pubky{userId} when content has no mention pattern at end', () => {
      expect(atEnd('Hello world').content).toBe(`Hello world pubky${userId} `);
    });

    it('appends pubky{userId} to empty content', () => {
      expect(atEnd('').content).toBe(`pubky${userId} `);
    });

    it('appends when @ pattern is not at the end', () => {
      expect(atEnd('@john is cool').content).toBe(`@john is cool pubky${userId} `);
    });

    it('appends when pubky: (with colon) is at the end (invalid format)', () => {
      // pubky: with colon is not a valid pattern, so it falls back to append
      expect(atEnd('Hello pubky:abc').content).toBe(`Hello pubky:abc pubky${userId} `);
    });
  });

  describe('adds trailing space', () => {
    it('always adds a trailing space after the mention', () => {
      expect(atEnd('Hello @test').content.endsWith(' ')).toBe(true);
    });
  });

  describe('caret inside the value', () => {
    it('replaces only the pattern before the caret and keeps the text after it', () => {
      // 'Hello @jo| world' - the mention is written over '@jo', ' world' survives
      const result = getContentWithMention('Hello @jo world', 9, userId);

      expect(result.content).toBe(`Hello pubky${userId}  world`);
    });

    it('leaves the caret after the inserted mention, before the surviving text', () => {
      const result = getContentWithMention('Hello @jo world', 9, userId);

      expect(result.content.slice(0, result.caret)).toBe(`Hello pubky${userId} `);
      expect(result.content.slice(result.caret)).toBe(' world');
    });

    it('replaces a pk: pattern before the caret', () => {
      const result = getContentWithMention('Hello pk:abc world', 12, userId);

      expect(result.content).toBe(`Hello pubky${userId}  world`);
      expect(result.caret).toBe(`Hello pubky${userId} `.length);
    });

    it('keeps the text after the caret when the caret sits mid-word', () => {
      // 'Hello @jo|hn' - 'hn' was already there and is left alone
      const result = getContentWithMention('Hello @john', 9, userId);

      expect(result.content).toBe(`Hello pubky${userId} hn`);
      expect(result.content.slice(result.caret)).toBe('hn');
    });

    it('does not touch an @ pattern that starts after the caret', () => {
      // 'Hello |@john' - nothing to complete at the caret, so the mention is written there
      const result = getContentWithMention('Hello @john', 5, userId);

      expect(result.content).toBe(`Hello pubky${userId}  @john`);
      expect(result.content.slice(0, result.caret)).toBe(`Hello pubky${userId} `);
    });

    it('writes at the caret when the value is empty', () => {
      const result = getContentWithMention('', 0, userId);

      expect(result.content).toBe(`pubky${userId} `);
      expect(result.caret).toBe(`pubky${userId} `.length);
    });

    it('clamps a caret past the end of the value', () => {
      const result = getContentWithMention('Hello @jo', 999, userId);

      expect(result.content).toBe(`Hello pubky${userId} `);
      expect(result.caret).toBe(`Hello pubky${userId} `.length);
    });
  });
});
