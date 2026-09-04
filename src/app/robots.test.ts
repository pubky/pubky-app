import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('allows every crawler to fetch every path (link previews must not be blocked)', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/' } });
  });
});
