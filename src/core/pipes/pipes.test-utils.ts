/**
 * Shared test utilities for normalizer tests: common test data and the real package, unmocked.
 */
import { buildUri } from 'pubky-social-specs';
import { vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
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
 * Test post IDs following the expected format.
 */
export const TEST_POST_IDS = {
  POST_1: '0032PARTQP4G0',
  POST_2: '0032QASXZ1230',
  POST_3: '0032TESTID789',
};

/** Silences Logger.debug; the package itself runs for real. */
export const setupIntegrationTestMocks = () => {
  vi.spyOn(Logger, 'debug').mockImplementation(() => {});
};

/** Restore all mocks after tests. */
export const restoreMocks = () => {
  vi.restoreAllMocks();
};

/**
 * Invalid input test cases for parameterized testing.
 */
export const INVALID_INPUTS = {
  EMPTY: '' as Pubky,
  INVALID_FORMAT: 'invalid-short-pubky' as Pubky,
};

/** A reference to a post, as a v1 write spells it. */
export const createPostUri = (authorPubky = TEST_PUBKY.USER_1, postId = TEST_POST_IDS.POST_1) =>
  buildUri(authorPubky, 'post', postId);
