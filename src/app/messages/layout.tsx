'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { isPubkyIdentifier, stripPubkyPrefix } from '@/libs/utils/utils';
import { Messages } from '@/templates/Messages/Messages';

/** One shell for `/messages` and `/messages/[pubky]`, so the conversation list stays mounted. */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ pubky?: string }>();
  const raw = params.pubky ? stripPubkyPrefix(decodeURIComponent(params.pubky)) : null;
  const peer = raw && isPubkyIdentifier(raw) ? raw : null;
  return <Messages peer={peer}>{children}</Messages>;
}
