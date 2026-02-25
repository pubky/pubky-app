import { describe, it, expect } from 'vitest';
import { mapUserIdsToMutedUsers } from './MutedUsersList.utils';
import type { UserMapEntry } from './MutedUsersList.types';

describe('mapUserIdsToMutedUsers', () => {
  it('returns empty array for empty userIds', () => {
    const usersMap = new Map<string, UserMapEntry>();
    const result = mapUserIdsToMutedUsers([], usersMap);
    expect(result).toEqual([]);
  });

  it('maps user IDs to MutedUser objects with user data from map', () => {
    const usersMap = new Map<string, UserMapEntry>([
      ['user-1', { name: 'Alice', avatarUrl: 'https://example.com/alice.png' }],
      ['user-2', { name: 'Bob', avatarUrl: 'https://example.com/bob.png' }],
    ]);

    const result = mapUserIdsToMutedUsers(['user-1', 'user-2'], usersMap);

    expect(result).toEqual([
      { id: 'user-1', name: 'Alice', avatar: 'https://example.com/alice.png' },
      { id: 'user-2', name: 'Bob', avatar: 'https://example.com/bob.png' },
    ]);
  });

  it('returns undefined name and avatar when user not found in map', () => {
    const usersMap = new Map<string, UserMapEntry>();

    const result = mapUserIdsToMutedUsers(['unknown-user'], usersMap);

    expect(result).toEqual([{ id: 'unknown-user', name: undefined, avatar: undefined }]);
  });

  it('handles null avatarUrl by converting to undefined', () => {
    const usersMap = new Map<string, UserMapEntry>([['user-1', { name: 'Alice', avatarUrl: null }]]);

    const result = mapUserIdsToMutedUsers(['user-1'], usersMap);

    expect(result).toEqual([{ id: 'user-1', name: 'Alice', avatar: undefined }]);
  });

  it('handles undefined avatarUrl', () => {
    const usersMap = new Map<string, UserMapEntry>([['user-1', { name: 'Alice', avatarUrl: undefined }]]);

    const result = mapUserIdsToMutedUsers(['user-1'], usersMap);

    expect(result).toEqual([{ id: 'user-1', name: 'Alice', avatar: undefined }]);
  });

  it('handles missing name in user entry', () => {
    const usersMap = new Map<string, UserMapEntry>([['user-1', { avatarUrl: 'https://example.com/avatar.png' }]]);

    const result = mapUserIdsToMutedUsers(['user-1'], usersMap);

    expect(result).toEqual([{ id: 'user-1', name: undefined, avatar: 'https://example.com/avatar.png' }]);
  });

  it('handles mixed found and not found users', () => {
    const usersMap = new Map<string, UserMapEntry>([
      ['user-1', { name: 'Alice', avatarUrl: 'https://example.com/alice.png' }],
    ]);

    const result = mapUserIdsToMutedUsers(['user-1', 'user-2'], usersMap);

    expect(result).toEqual([
      { id: 'user-1', name: 'Alice', avatar: 'https://example.com/alice.png' },
      { id: 'user-2', name: undefined, avatar: undefined },
    ]);
  });

  it('preserves order of input userIds', () => {
    const usersMap = new Map<string, UserMapEntry>([
      ['user-a', { name: 'A' }],
      ['user-b', { name: 'B' }],
      ['user-c', { name: 'C' }],
    ]);

    const result = mapUserIdsToMutedUsers(['user-c', 'user-a', 'user-b'], usersMap);

    expect(result.map((u) => u.id)).toEqual(['user-c', 'user-a', 'user-b']);
  });
});
