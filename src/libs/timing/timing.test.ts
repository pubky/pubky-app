import { afterEach, describe, expect, it, vi } from 'vitest';
import { markPhase } from './timing';

describe('markPhase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    performance.clearMarks();
  });

  it('leaves a prefixed mark', () => {
    markPhase('bootstrap done');

    expect(performance.getEntriesByName('pubky:bootstrap done', 'mark')).toHaveLength(1);
  });

  it('never throws when the mark fails', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('no timing here');
    });

    expect(() => markPhase('gate passed')).not.toThrow();
  });
});
