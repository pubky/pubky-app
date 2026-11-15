'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Typography } from '@/atoms/Typography/Typography';

export const PUBCHI_TIER_PANEL_SURFACE = 'pubchi-tier-panel';

export type PubchiTier = 'read-only' | 'assisted' | 'autonomous';

export type PubchiTierPanelProps = {
  desiredTier: PubchiTier;
  effectiveTier: PubchiTier;
  effectiveReason?: string;
  availableTiers: PubchiTier[];
  autonomousDisabledReason: string;
  onChangeDesired: (tier: PubchiTier) => void | Promise<void>;
  saving?: boolean;
};

const tierDetails: Record<PubchiTier, { label: string; description: string; can: string; cannot: string }> = {
  'read-only': {
    label: 'Read-only',
    description: 'Understand your graph without changing it.',
    can: 'Sees your graph, answers, previews feeds.',
    cannot: 'Post, tag, or change anything.',
  },
  assisted: {
    label: 'Assisted',
    description: 'Answers and proposes; you approve.',
    can: 'Answers questions about your graph and proposes feeds you approve.',
    cannot: 'Act unattended; nothing is published without you.',
  },
  autonomous: {
    label: 'Autonomous',
    description: 'Let Pubchi act within rules you set.',
    can: 'Acts as itself within the rules you set.',
    cannot: 'Act outside its granted capabilities.',
  },
};

const tierOrder: PubchiTier[] = ['read-only', 'assisted', 'autonomous'];

function tierRank(tier: PubchiTier) {
  return tierOrder.indexOf(tier);
}

export function PubchiTierPanel({
  desiredTier,
  effectiveTier,
  effectiveReason,
  availableTiers,
  autonomousDisabledReason,
  onChangeDesired,
  saving = false,
}: PubchiTierPanelProps) {
  const [pendingDowngrade, setPendingDowngrade] = useState<PubchiTier | null>(null);
  const isEffectiveBelowDesired = tierRank(effectiveTier) < tierRank(desiredTier);

  function handleChange(nextTier: string) {
    const next = nextTier as PubchiTier;
    if (next === desiredTier || saving) return;
    setPendingDowngrade(tierRank(next) < tierRank(desiredTier) ? next : null);
    void onChangeDesired(next);
  }

  return (
    <Card data-surface={PUBCHI_TIER_PANEL_SURFACE} data-testid={PUBCHI_TIER_PANEL_SURFACE}>
      <CardHeader>
        <CardTitle>Permission tier</CardTitle>
        <Typography size="sm" className="text-muted-foreground">
          Choose what your Pubchi is allowed to do.
        </Typography>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup value={desiredTier} onValueChange={handleChange} aria-label="Pubchi permission tier">
          {tierOrder.map((tier) => {
            const details = tierDetails[tier];
            const isAutonomous = tier === 'autonomous';
            const disabled = saving || (isAutonomous && !availableTiers.includes(tier));

            return (
              <div
                key={tier}
                className="flex gap-3 rounded-lg border border-border p-4 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-60 has-[[data-state=checked]]:border-brand"
              >
                <RadioGroupItem value={tier} id={`pubchi-tier-${tier}`} disabled={disabled} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`pubchi-tier-${tier}`} className="cursor-pointer font-medium">
                    {details.label}
                  </label>
                  <Typography size="sm" className="mt-1 text-muted-foreground">
                    {details.description}
                  </Typography>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="font-medium">What it can do: </span>
                      <span className="text-muted-foreground">{details.can}</span>
                    </div>
                    <div>
                      <span className="font-medium">What it cannot do: </span>
                      <span className="text-muted-foreground">{details.cannot}</span>
                    </div>
                  </div>
                  {isAutonomous && disabled ? (
                    <Typography size="sm" className="mt-3 text-muted-foreground">
                      {autonomousDisabledReason}
                    </Typography>
                  ) : null}
                </div>
              </div>
            );
          })}
        </RadioGroup>

        <Typography size="sm" className="font-medium">
          Desired: {tierDetails[desiredTier].label} · Effective: {tierDetails[effectiveTier].label}
        </Typography>

        {isEffectiveBelowDesired && effectiveReason ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {effectiveReason}
          </div>
        ) : null}

        {pendingDowngrade ? (
          <div role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            Switching down revokes access first, then saves.
          </div>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium underline">
            Technical details
            <ChevronDown aria-hidden="true" className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Read-only: </span>
              <code>/pub/app.pubchi/v1/:rw</code> on your session.
            </div>
            <div>
              <span className="font-medium text-foreground">Assisted: </span>
              <code>/pub/app.pubchi/v1/:rw</code> on your session.
            </div>
            <div>
              <span className="font-medium text-foreground">Autonomous: </span>
              <code>/pub/app.pubchi/v1/:rw</code>, <code>/pub/pubky.app/posts/:w</code>, and{' '}
              <code>/pub/pubky.app/tags/:w</code> on bot sessions.
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
