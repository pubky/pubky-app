/**
 * Shared test utilities for normalizer tests.
 * Provides common test data, mock factories, and assertion helpers.
 */
import { vi } from 'vitest';
import * as Core from '@/core';
import { PubkySpecsBuilder } from 'pubky-app-specs';
import { Logger } from '@/libs/logger/logger';

/**
 * Valid z-base32 encoded public keys for testing.
 * These are the only pubky values that pass strict validation.
 */
export const TEST_PUBKY = {
  USER_1: '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Core.Pubky,
  USER_2: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
};

/**
 * Test post IDs following the expected format.
 */
export const TEST_POST_IDS = {
  POST_1: '0032PARTQP4G0',
  POST_2: '0032QASXZ1230',
  POST_3: '0032TESTID789',
};

/**
 * Setup common mocks for unit tests.
 * Mocks PubkySpecsSingleton and Logger.debug.
 */
export const setupUnitTestMocks = <T extends Record<string, ReturnType<typeof vi.fn>>>(mockBuilder: T) => {
  vi.clearAllMocks();
  vi.spyOn(Core.PubkySpecsSingleton, 'get').mockReturnValue(mockBuilder as unknown as PubkySpecsBuilder);
  vi.spyOn(Logger, 'debug').mockImplementation(() => {});
};

/**
 * Setup common mocks for integration tests.
 * Only mocks Logger.debug to allow real library behavior.
 */
export const setupIntegrationTestMocks = () => {
  vi.spyOn(Logger, 'debug').mockImplementation(() => {});
};

/**
 * Restore all mocks after tests and reset singleton state.
 */
export const restoreMocks = () => {
  vi.restoreAllMocks();
  Core.PubkySpecsSingleton.reset();
};

/**
 * Invalid input test cases for parameterized testing.
 */
export const INVALID_INPUTS = {
  EMPTY: '' as Core.Pubky,
  NULL: null as unknown as Core.Pubky,
  UNDEFINED: undefined as unknown as Core.Pubky,
  INVALID_FORMAT: 'invalid-short-pubky' as Core.Pubky,
};

/**
 * Helper to build a pubky URI path.
 */
export const buildPubkyUri = (pubky: Core.Pubky, path: string) => `pubky://${pubky}/pub/pubky.app/${path}`;

/**
 * Helper to create a post URI.
 */
export const createPostUri = (authorPubky = TEST_PUBKY.USER_1, postId = TEST_POST_IDS.POST_1) =>
  buildPubkyUri(authorPubky, `posts/${postId}`);
