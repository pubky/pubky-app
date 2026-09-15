'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { UserController } from '@/controllers/user/user';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

const EMPTY_TAGS: Map<Pubky, NexusTag[]> = new Map();

/**
 * useGraphProfileTags
 *
 * One bulk live query over the local user_tags table for every user on the
 * graph canvas. Strictly local by contract (the ingestion pipeline fills
 * gaps, never this reader); Dexie re-fires it when tag rows land, so chips
 * pop in without any per-node fetching.
 */
export function useGraphProfileTags(pubkys: Pubky[]): Map<Pubky, NexusTag[]> {
  const pubkyKey = [...pubkys].sort().join(',');
  const tags = useLiveQuery(async () => {
    try {
      if (pubkys.length === 0) return EMPTY_TAGS;
      return await UserController.getManyTags({ userIds: pubkys });
    } catch (error) {
      Logger.error('useGraphProfileTags: failed to read user tags', { error });
      return EMPTY_TAGS;
    }
  }, [pubkyKey]);
  return tags ?? EMPTY_TAGS;
}
