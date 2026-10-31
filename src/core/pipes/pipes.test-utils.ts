/**
 * Shared test utilities for normalizer tests.
 */
import { vi } from 'vitest';
import type { Pubky } from '@/models/models.types';

/**
 * Valid z-base32 encoded public keys for testing.
 * These are the only pubky values that pass strict validation.
 */
export const TEST_PUBKY = {
  USER_1: '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky,
  USER_2: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
};

/**
 * Restore all mocks after tests.
 */
export const restoreMocks = () => {
  vi.restoreAllMocks();
};
