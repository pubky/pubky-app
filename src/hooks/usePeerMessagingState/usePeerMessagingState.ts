'use client';

import { useEffect, useState } from 'react';
import type { PeerMessagingState } from '@/application/messages/messages';
import { MessagesController } from '@/controllers/messages/messages';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useMessagesStore } from '@/stores/messages/messages.store';

/**
 * Whether `peer` can receive messages (has published a messaging key). `unknown` until the check
 * finishes, and while the viewer's own Messages are not enabled.
 */
export function usePeerMessagingState(peer: Pubky | null | undefined): PeerMessagingState {
  const status = useMessagesStore((state) => state.status);
  const [result, setResult] = useState<{ peer: Pubky; state: PeerMessagingState } | null>(null);

  useEffect(() => {
    if (!peer || status !== 'ready') return;
    let active = true;
    MessagesController.fetchPeerState(peer)
      .then((state) => {
        if (active) setResult({ peer, state });
      })
      .catch((error) => Logger.warn('[messages] peer key lookup failed', { error }));
    return () => {
      active = false;
    };
  }, [peer, status]);

  return result && result.peer === peer && status === 'ready' ? result.state : 'unknown';
}
