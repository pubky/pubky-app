import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRecoveryPhraseValidation } from './useRecoveryPhraseValidation';

describe('useRecoveryPhraseValidation', () => {
  const mockRecoveryWords = [
    'tube',
    'tube',
    'resource',
    'mass',
    'door',
    'firm',
    'genius',
    'parrot',
    'girl',
    'orphan',
    'window',
    'world',
  ];

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    expect(result.current.userWords).toEqual(Array(12).fill(''));
    expect(result.current.errors).toEqual(Array(12).fill(false));
    expect(result.current.isComplete).toBe(false);
    expect(result.current.remainingWords).toHaveLength(12);
    expect(result.current.remainingWords.every((w) => !w.isUsed)).toBe(true);
  });

  it('should handle word click correctly', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    act(() => {
      result.current.handleWordClick('tube');
    });

    expect(result.current.userWords[0]).toBe('tube');
    expect(result.current.isComplete).toBe(false);

    // Check that tube usage is tracked (1 out of 2 used, so not all marked as used yet)
    const tubeWords = result.current.remainingWords.filter((w) => w.word === 'tube');
    const usedTubes = tubeWords.filter((w) => w.isUsed).length;
    expect(usedTubes).toBe(0); // Not all used yet
  });

  it('should handle duplicate words correctly', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    // Click first tube
    act(() => {
      result.current.handleWordClick('tube');
    });

    expect(result.current.userWords[0]).toBe('tube');

    // Click second tube
    act(() => {
      result.current.handleWordClick('tube');
    });

    expect(result.current.userWords[1]).toBe('tube');

    // Both tube instances should now be marked as used
    const tubeWords = result.current.remainingWords.filter((w) => w.word === 'tube');
    expect(tubeWords.every((w) => w.isUsed)).toBe(true);
  });

  it('should prevent clicking words when all instances are used', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    // Click both tube instances
    act(() => {
      result.current.handleWordClick('tube');
    });
    act(() => {
      result.current.handleWordClick('tube');
    });

    const initialTubeCount = result.current.userWords.filter((word) => word === 'tube').length;
    expect(initialTubeCount).toBe(2);

    // Try to click tube again (should be prevented)
    act(() => {
      result.current.handleWordClick('tube');
    });

    // Should still only have two tubes
    expect(result.current.userWords.filter((word) => word === 'tube')).toHaveLength(2);
  });

  it('should clear words correctly', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    act(() => {
      result.current.handleWordClick('tube');
    });

    expect(result.current.userWords[0]).toBe('tube');

    // After one click, tube is not yet marked as used (1 out of 2 used)
    const tubeWords = result.current.remainingWords.filter((w) => w.word === 'tube');
    expect(tubeWords.every((w) => !w.isUsed)).toBe(true);

    act(() => {
      result.current.clearWord(0);
    });

    expect(result.current.userWords[0]).toBe('');

    // After clearing, tube should still be available (none used now)
    const tubeWordsAfterClear = result.current.remainingWords.filter((w) => w.word === 'tube');
    expect(tubeWordsAfterClear.every((w) => !w.isUsed)).toBe(true);
  });

  it('should validate words correctly', async () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    // Fill slots with correct words one by one
    await act(async () => {
      result.current.handleWordClick('tube');
    });

    await act(async () => {
      result.current.handleWordClick('tube');
    });

    await act(async () => {
      result.current.handleWordClick('resource');
    });

    // Check that we have some words filled
    expect(result.current.userWords[0]).toBe('tube');
    expect(result.current.userWords[1]).toBe('tube');
    expect(result.current.userWords[2]).toBe('resource');

    // Test validation
    await act(async () => {
      const isValid = result.current.validateWords();
      expect(isValid).toBe(false); // Not all slots filled yet
    });
  });

  it('should detect errors for wrong words', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    // Click wrong word for first slot (expected "tube")
    act(() => {
      result.current.handleWordClick('door');
    });

    expect(result.current.userWords[0]).toBe('door');
    expect(result.current.errors[0]).toBe(true);
    expect(result.current.isComplete).toBe(false);
  });

  it('should handle identical words correctly', () => {
    const identicalWords = Array(12).fill('bacon');
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: identicalWords }));

    // Click first few bacon instances - they should fill slots 0, 1, 2
    act(() => {
      result.current.handleWordClick('bacon');
    });

    act(() => {
      result.current.handleWordClick('bacon');
    });

    act(() => {
      result.current.handleWordClick('bacon');
    });

    expect(result.current.userWords[0]).toBe('bacon');
    expect(result.current.userWords[1]).toBe('bacon');
    expect(result.current.userWords[2]).toBe('bacon');

    // All bacon instances should be marked as used after 12 clicks
    // Let's fill all slots
    for (let i = 3; i < 12; i++) {
      act(() => {
        result.current.handleWordClick('bacon');
      });
    }

    const baconWords = result.current.remainingWords.filter((w) => w.word === 'bacon');
    expect(baconWords.every((w) => w.isUsed)).toBe(true);

    // Clear first slot
    act(() => {
      result.current.clearWord(0);
    });

    expect(result.current.userWords[0]).toBe('');

    // After clearing, bacon should be available again
    const baconWordsAfterClear = result.current.remainingWords.filter((w) => w.word === 'bacon');
    expect(baconWordsAfterClear.some((w) => !w.isUsed)).toBe(true);
  });

  it('should mark words as used when count limit is reached', () => {
    const { result } = renderHook(() => useRecoveryPhraseValidation({ recoveryWords: mockRecoveryWords }));

    // "tube" appears twice in recoveryWords
    act(() => {
      result.current.handleWordClick('tube');
    });

    // After one click, not all tubes are used
    let tubeWords = result.current.remainingWords.filter((w) => w.word === 'tube');
    expect(tubeWords.some((w) => !w.isUsed)).toBe(true);

    act(() => {
      result.current.handleWordClick('tube');
    });

    // After two clicks, all tubes should be marked as used
    tubeWords = result.current.remainingWords.filter((w) => w.word === 'tube');
    expect(tubeWords.every((w) => w.isUsed)).toBe(true);
  });
});
