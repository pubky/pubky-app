'use client';

import { useRouter } from 'next/navigation';
import { Brain, Check, Clipboard, KeyRound } from 'lucide-react';
import type { MouseEvent } from 'react';
import { APP_ROUTES } from '@/app/routes';
import { Avatar, AvatarFallback } from '@/atoms/Avatar/Avatar';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { formatPublicKey } from '@/libs/utils/utils';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { initialFromName } from '@/organisms/AvatarWithFallback/AvatarWithFallback.utils';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';

type PubchiSummary = {
  bot: string;
  displayName: string;
  verified: boolean;
  backupConfirmedAt?: number | null;
};

export type PubchiFlyoutHeaderProps = {
  pubchi?: PubchiSummary;
  tier?: 'read-only' | 'assisted' | 'autonomous';
  brainLabel?: string;
  missedCount?: number;
};

export function PubchiFlyoutHeader({
  pubchi,
  tier = 'read-only',
  brainLabel = 'Hosted Kimi',
  missedCount = 0,
}: PubchiFlyoutHeaderProps) {
  const { copyToClipboard } = useCopyToClipboard();
  const router = useRouter();
  const closeFlyout = usePubchiStore((state) => state.closeFlyout);
  const navigateFromFlyout = (event: MouseEvent, href: string) => {
    event.preventDefault();
    closeFlyout();
    router.push(href);
  };

  if (!pubchi?.bot) {
    return (
      <Link href="/settings/pubchi" className="block" data-testid="pubchi-create-header">
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-4">
            <Avatar>
              <AvatarFallback>
                <KeyRound aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div>
              <Typography className="font-medium">Create your Pubchi</Typography>
              <Typography size="sm" className="text-muted-foreground">
                Give your graph a personal assistant.
              </Typography>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  const tierLabel = tier === 'assisted' ? 'Assisted' : tier === 'autonomous' ? 'Autonomous' : 'Read-only';
  const displayName = pubchi.displayName || 'Pubchi';
  return (
    <Card className="border-border transition-colors hover:border-brand" data-testid="pubchi-flyout-header">
      <CardContent className="flex items-center gap-3 p-4">
        <Link
          href={APP_ROUTES.PUBCHI}
          className="flex min-w-0 flex-1 items-center gap-3"
          onClick={(event) => navigateFromFlyout(event, APP_ROUTES.PUBCHI)}
        >
          <Avatar size="lg" className="shrink-0">
            <AvatarFallback className="overflow-hidden border-none">
              <FacehashAvatar seed={pubchi.bot} initial={initialFromName(displayName)} />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Typography className="truncate font-medium">{displayName}</Typography>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline">{tierLabel}</Badge>
              <Badge variant="secondary">{brainLabel}</Badge>
              {missedCount > 0 ? <Badge data-testid="pubchi-missed-badge">{missedCount} missed</Badge> : null}
            </div>
            <Typography
              size="xs"
              className={
                pubchi.verified ? 'mt-1 flex items-center gap-1 text-muted-foreground' : 'mt-1 text-destructive'
              }
            >
              {pubchi.verified ? <Check aria-hidden="true" className="size-3" /> : null}
              {pubchi.verified ? 'Operated by you — verified' : 'Ownership unverified'}
            </Typography>
            <button
              type="button"
              className="mt-1 flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
              title={pubchi.bot}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void copyToClipboard(pubchi.bot);
              }}
            >
              <span className="truncate">{formatPublicKey({ key: pubchi.bot })}</span>
              <Clipboard aria-hidden="true" className="size-3 shrink-0" />
            </button>
          </div>
        </Link>
        <Link
          href={APP_ROUTES.PUBCHI_BRAIN}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:text-brand"
          onClick={(event) => navigateFromFlyout(event, APP_ROUTES.PUBCHI_BRAIN)}
        >
          <Brain aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Edit brain</span>
        </Link>
      </CardContent>
    </Card>
  );
}
