'use client';

import { useRef, useState } from 'react';
import { UserController } from '@/controllers/user/user';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { FollowAllProgress, FollowAllResult, UseFollowAllOptions, UseFollowAllResult } from './useFollowAll.types';

const IDLE_PROGRESS: FollowAllProgress = { completed: 0, total: 0 };

function formatFollowAllSummary(followedCount: number, failedCount: number): string {
  const people = followedCount === 1 ? 'person' : 'people';
  if (failedCount === 0) {
    return `Following ${followedCount} ${people}`;
  }
  const attempted = followedCount + failedCount;
  return `Followed ${followedCount} of ${attempted} ${attempted === 1 ? 'person' : 'people'}, ${failedCount} failed`;
}

/**
 * useFollowAll
 *
 * Bulk follow orchestration for the onboarding "Follow your best matches" step.
 *
 * Runs one `UserController.commitFollow(PUT)` per target **sequentially**: each commit awaits the
 * local Dexie write and the homeserver PUT, so a serial loop gives deterministic progress and
 * avoids a burst of concurrent homeserver writes. Already-followed targets are skipped (no
 * double-follow calls), partial failures are collected rather than thrown, and one summary toast
 * is shown at the end instead of one toast per user. `followAll` never rejects, so the caller can
 * always proceed to Finish.
 */
export function useFollowAll({ onFollowed }: UseFollowAllOptions = {}): UseFollowAllResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<FollowAllProgress>(IDLE_PROGRESS);
  // Ref-based re-entrancy guard: a second click before React re-renders must not start a parallel run.
  const runningRef = useRef(false);

  const followAll: UseFollowAllResult['followAll'] = async (targets) => {
    const result: FollowAllResult = { followed: [], failed: [], skipped: [] };

    if (!currentUserPubky || runningRef.current) {
      return result;
    }

    const pending: Pubky[] = [];
    for (const target of targets) {
      if (target.isFollowing || target.id === currentUserPubky) {
        result.skipped.push(target.id);
      } else {
        pending.push(target.id);
      }
    }

    if (pending.length === 0) {
      return result;
    }

    runningRef.current = true;
    setIsRunning(true);
    setProgress({ completed: 0, total: pending.length });

    try {
      for (const followee of pending) {
        try {
          await UserController.commitFollow(HttpMethod.PUT, { follower: currentUserPubky, followee });
          result.followed.push(followee);
          onFollowed?.(followee);
        } catch (err) {
          result.failed.push(followee);
          Logger.error('[useFollowAll] Failed to follow user', { followee, error: err });
        }
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
      }

      if (result.followed.length === 0) {
        toast({ variant: 'error', description: 'Failed to follow suggested people' });
      } else {
        toast({
          variant: result.failed.length > 0 ? 'warning' : 'default',
          title: formatFollowAllSummary(result.followed.length, result.failed.length),
        });
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      setProgress(IDLE_PROGRESS);
    }

    return result;
  };

  return { followAll, isRunning, progress };
}
