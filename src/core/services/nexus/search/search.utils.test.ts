import { describe, expect, it } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { toSearchReachParams } from './search.utils';

describe('toSearchReachParams', () => {
  it('sends nothing for All, with or without a viewer', () => {
    expect(toSearchReachParams(undefined, undefined, 'test')).toEqual({});
    expect(toSearchReachParams(undefined, 'viewer', 'test')).toEqual({});
  });

  it.each(['following', 'friends', 'wot'] as const)('pairs %s with the viewer', (reach) => {
    expect(toSearchReachParams(reach, 'viewer', 'test')).toEqual({ reach, user_id: 'viewer' });
  });

  it('rejects a reach without a viewer instead of widening it to All', () => {
    expect(() => toSearchReachParams('friends', undefined, 'NexusSearchService.usersByTags')).toThrow(
      expect.objectContaining({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.UNAUTHORIZED,
        service: ErrorService.Nexus,
        operation: 'NexusSearchService.usersByTags',
      }),
    );
  });
});
