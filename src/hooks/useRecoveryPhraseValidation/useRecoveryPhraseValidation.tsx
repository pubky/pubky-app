'use client';

import { useCallback, useMemo, useState } from 'react';

export interface UseRecoveryPhraseValidationProps {
  recoveryWords: string[];
}

export interface UseRecoveryPhraseValidationReturn {
  userWords: string[];
  errors: boolean[];
  remainingWords: Array<{ word: string; index: number; isUsed: boolean }>;
  handleWordClick: (word: string) => void;
  validateWords: () => boolean;
  clearWord: (index: number) => void;
  isComplete: boolean;
}

export function useRecoveryPhraseValidation({
  recoveryWords,
}: UseRecoveryPhraseValidationProps): UseRecoveryPhraseValidationReturn {
  const [userWords, setUserWords] = useState<string[]>(Array(12).fill(''));
  const [errors, setErrors] = useState<boolean[]>(Array(12).fill(false));

  // Sorted words for selection
  const availableWords = useMemo(() => [...recoveryWords].sort(), [recoveryWords]);

  // Calculate which words are still available to click
  const remainingWords = useMemo(() => {
    const usedCount = new Map<string, number>();
    userWords.forEach((word) => {
      if (word) usedCount.set(word, (usedCount.get(word) || 0) + 1);
    });

    return availableWords.map((word, index) => {
      const used = usedCount.get(word) || 0;
      const total = recoveryWords.filter((w) => w === word).length;
      return { word, index, isUsed: used >= total };
    });
  }, [availableWords, userWords, recoveryWords]);

  const handleWordClick = useCallback(
    (word: string) => {
      // Find first empty slot
      const emptyIndex = userWords.findIndex((w) => w === '');
      if (emptyIndex === -1) return;

      // Check if we can use this word
      const wordCountInPhrase = recoveryWords.filter((w) => w === word).length;
      const usedCount = userWords.filter((w) => w === word).length;
      if (usedCount >= wordCountInPhrase) return;

      // Add word to slot
      setUserWords((prev) => {
        const next = [...prev];
        next[emptyIndex] = word;
        return next;
      });

      // Validate immediately
      setErrors((prev) => {
        const next = [...prev];
        next[emptyIndex] = word !== recoveryWords[emptyIndex];
        return next;
      });
    },
    [userWords, recoveryWords],
  );

  const clearWord = useCallback(
    (index: number) => {
      if (userWords[index]) {
        setUserWords((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });

        setErrors((prev) => {
          const next = [...prev];
          next[index] = false;
          return next;
        });
      }
    },
    [userWords],
  );

  const validateWords = useCallback(() => {
    const newErrors = userWords.map((word, i) => word !== '' && word !== recoveryWords[i]);
    setErrors(newErrors);

    const allFilled = userWords.every((word) => word !== '');
    const allCorrect = newErrors.every((err) => !err);

    return allFilled && allCorrect;
  }, [userWords, recoveryWords]);

  const isComplete = useMemo(() => {
    return userWords.every((w) => w !== '') && errors.every((e) => !e);
  }, [userWords, errors]);

  return {
    userWords,
    errors,
    remainingWords,
    handleWordClick,
    validateWords,
    clearWord,
    isComplete,
  };
}
