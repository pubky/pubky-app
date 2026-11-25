import { describe, expect, it } from 'vitest';
import { parseConversation } from './ask-body';

describe('Pubchi conversation window', () => {
  it('counts astral characters as one code point', () => {
    expect(parseConversation({ turns: [{ role: 'user', text: '😀'.repeat(600) }] }).ok).toBe(true);
    expect(parseConversation({ turns: [{ role: 'user', text: '😀'.repeat(601) }] }).ok).toBe(false);
  });

  it.each([
    [{ turns: [{ role: 'assistant', text: 'answer' }] }],
    [
      {
        turns: [
          { role: 'user', text: 'question' },
          { role: 'user', text: 'again' },
        ],
      },
    ],
    [{ turns: [{ role: 'user', text: 'x'.repeat(4_801) }] }],
  ])('rejects invalid windows', (input) => {
    expect(parseConversation(input).ok).toBe(false);
  });

  it('accepts web and unknown assistant basis values so a later ask can round-trip them', () => {
    expect(
      parseConversation({
        turns: [
          { role: 'user', text: 'what is Pubky in the news?' },
          { role: 'assistant', text: 'Recent coverage.', basis: 'web' },
        ],
      }).ok,
    ).toBe(true);
    expect(
      parseConversation({
        turns: [
          { role: 'user', text: 'what is Pubky?' },
          { role: 'assistant', text: 'A public-key protocol.', basis: 'corpus-v2' },
        ],
      }).ok,
    ).toBe(true);
  });
});
