'use client';

import { useState } from 'react';
import { FeedController } from '@/controllers/feed/feed';
import type { TFeedCreateParams, TFeedIdParam, TFeedUpdateParams } from '@/controllers/feed/feed.types';

export function useCustomFeedMutation() {
  const [loading, setLoading] = useState(false);

  const runMutation = async <T>(mutation: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      return await mutation();
    } finally {
      setLoading(false);
    }
  };

  return {
    commitCreate: (params: TFeedCreateParams) => runMutation(() => FeedController.commitCreate(params)),
    commitUpdate: (params: TFeedUpdateParams) => runMutation(() => FeedController.commitUpdate(params)),
    commitDelete: (params: TFeedIdParam) => runMutation(() => FeedController.commitDelete(params)),
    loading,
  };
}
