'use client';

import { Check, CircleAlert, Clipboard, KeyRound, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/atoms/Avatar/Avatar';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { formatPublicKey, formatUSDate } from '@/libs/utils/utils';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { initialFromName } from '@/organisms/AvatarWithFallback/AvatarWithFallback.utils';

export const PUBCHI_PROFILE_CARD_SURFACE = 'pubchi-profile-card';

export type PubchiProfileCardProps = {
  bot: string;
  displayName: string;
  createdAt: number;
  verified: boolean;
  backupConfirmed: boolean;
  tier?: 'read-only' | 'assisted' | 'autonomous';
  brainLabel?: string;
  onBackup?: () => void;
  onRemove?: () => void;
};

const tierLabels = {
  'read-only': 'Read-only',
  assisted: 'Assisted',
  autonomous: 'Autonomous',
} as const;

export function PubchiProfileCard({
  bot,
  displayName,
  createdAt,
  verified,
  backupConfirmed,
  tier = 'read-only',
  brainLabel = 'Kimi K3 (Synonym-hosted)',
  onBackup,
  onRemove,
}: PubchiProfileCardProps) {
  const { copyToClipboard } = useCopyToClipboard();
  const displayBot = formatPublicKey({ key: bot });
  const fallbackInitial = initialFromName(displayName);

  return (
    <Card
      data-surface={PUBCHI_PROFILE_CARD_SURFACE}
      data-testid={PUBCHI_PROFILE_CARD_SURFACE}
      className="gap-4 border border-border"
    >
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar size="lg" className="size-16 shrink-0">
          <AvatarFallback className="overflow-hidden border-none">
            <FacehashAvatar seed={bot} initial={fallbackInitial} />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-lg">{displayName}</CardTitle>
          <Typography
            size="sm"
            className={
              verified
                ? 'mt-1 flex items-center gap-1 text-muted-foreground'
                : 'mt-1 flex items-center gap-1 text-destructive'
            }
          >
            {verified ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4" />
            )}
            <span>{verified ? 'Operated by you — verified' : 'Ownership unverified'}</span>
          </Typography>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="max-w-full truncate px-2 font-mono text-xs"
                  aria-label={`Copy bot public key ${bot}`}
                  title={bot}
                  onClick={() => {
                    void copyToClipboard(bot);
                  }}
                >
                  <KeyRound aria-hidden="true" />
                  <span className="truncate">{displayBot}</span>
                  <Clipboard aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent>{bot}</TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </TooltipProvider>
          <Badge variant="outline">{tierLabels[tier]}</Badge>
          <Badge variant="secondary">{brainLabel}</Badge>
        </div>

        <div className="flex flex-col gap-1">
          <Typography size="sm">Created {formatUSDate(new Date(createdAt * 1000))}</Typography>
          <Typography size="xs" className="text-muted-foreground">
            Public bot state — anyone can read this.
          </Typography>
        </div>
      </CardContent>

      {backupConfirmed || onBackup || onRemove ? (
        <CardFooter className="flex flex-wrap gap-2">
          {onBackup && !backupConfirmed ? (
            <Button type="button" variant="secondary" onClick={onBackup}>
              <KeyRound aria-hidden="true" />
              Back up key
            </Button>
          ) : backupConfirmed ? (
            <Typography size="sm" className="flex items-center gap-1 text-muted-foreground">
              <Check aria-hidden="true" className="size-4" />
              Backed up
            </Typography>
          ) : null}
          {onRemove ? (
            <Button type="button" variant="destructive-soft" onClick={onRemove}>
              <Trash2 aria-hidden="true" />
              Remove Pubchi
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
