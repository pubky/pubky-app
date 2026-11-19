'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Link } from '@/atoms/Link/Link';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { DM_CAPABILITIES } from '@/config/auth';
import { getPubkyRingLink } from '@/config/externalLinks';
import { MessagesController } from '@/controllers/messages/messages';
import { hasCapabilities } from '@/libs/auth/capabilities';
import { SessionUpgradePanel } from '@/organisms/SessionUpgradePanel/SessionUpgradePanel';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMessagesStore } from '@/stores/messages/messages.store';

/**
 * Shown until the session holds a messaging key. Asks Pubky Ring for the Messages scopes, including
 * the scoped encryption key (`e`) the messaging keypair is derived from, then publishes the key record.
 */
export function MessagesEnablePanel() {
  const status = useMessagesStore((state) => state.status);
  const grantedDm = useAuthStore((state) => {
    const session = state.selectSession();
    return session !== null && hasCapabilities(session.info.capabilities, DM_CAPABILITIES);
  });
  const [isOpen, setIsOpen] = useState(false);

  // The upgrade swaps the session in; derive the key and publish the record right away.
  useEffect(() => {
    if (grantedDm && status !== 'ready') void MessagesController.fetchStatus();
  }, [grantedDm, status]);

  if (status === 'unknown' || (grantedDm && status === 'locked')) {
    return (
      <Container overrideDefaults className="flex flex-1 items-center justify-center py-20">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container
      overrideDefaults
      data-testid="messages-enable-panel"
      className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <LockKeyhole className="size-10 text-brand" />
      <Typography className="text-2xl font-bold">{'Private messages, end to end'}</Typography>
      <Typography className="text-muted-foreground">
        {
          'Messages are encrypted on your device and stored on your own homeserver. Only you and the person you write to can read them.'
        }
      </Typography>
      <Typography size="sm" className="text-muted-foreground">
        {'Turning them on asks '}
        <Link href={getPubkyRingLink()} className="font-bold">
          {'Pubky Ring'}
        </Link>
        {' to share a messaging key with Pubky.app. This needs a Ring build that supports encryption approval.'}
      </Typography>
      {status === 'error' ? (
        <Button variant="outline" onClick={() => void MessagesController.fetchStatus()}>
          <RefreshCw className="size-4" />
          {'Try again'}
        </Button>
      ) : (
        <Button variant="brand" size="lg" data-testid="messages-enable-button" onClick={() => setIsOpen(true)}>
          {'Turn on messages'}
        </Button>
      )}
      <Dialog open={isOpen && !grantedDm} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="gap-4">
            <DialogTitle>{'Turn on messages'}</DialogTitle>
            <DialogDescription>
              {'Scan with Pubky Ring and approve the messaging permissions, including the encryption key.'}
            </DialogDescription>
          </DialogHeader>
          <SessionUpgradePanel requiredCapabilities={DM_CAPABILITIES} />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
