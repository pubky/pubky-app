'use client';

import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import type { Bucket, Phase } from 'pubky-social-migrator';
import { Container } from '@/atoms/Container/Container';
import { Progress } from '@/atoms/Progress/Progress';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { SocialMigrationProgressProps } from './SocialMigrationProgress.types';

const STEPS = [
  { key: 'probe', label: 'Checking your account' },
  { key: 'listing', label: 'Listing your data' },
  { key: 'migrating', label: 'Copying your data' },
  { key: 'flag', label: 'Finishing up' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];
type StepStatus = 'completed' | 'running' | 'pending';

/** The pass being copied, named for the user (the engine names it by its 0.x directory). */
const PASS_LABELS: Record<Bucket, string> = {
  files: 'Media details',
  blobs: 'Media',
  posts: 'Posts',
  tags: 'Tags',
  follows: 'Follows',
  profile: 'Profile',
  feeds: 'Feeds',
  bookmarks: 'Bookmarks',
  mutes: 'Muted users',
};

/** Every phase after `flag` means the walk is over; the screen only shows this organism while a run is in flight. */
const stepIndex = (phase: Phase | undefined): number => {
  const index = STEPS.findIndex((step) => step.key === phase);
  return phase === undefined ? 0 : index === -1 ? STEPS.length : index;
};

const getStepStatus = (step: StepKey, phase: Phase | undefined): StepStatus => {
  const current = stepIndex(phase);
  const own = STEPS.findIndex((candidate) => candidate.key === step);
  return own < current ? 'completed' : own === current ? 'running' : 'pending';
};

const StepIcon = ({ status }: { status: StepStatus }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-6 w-6 text-brand" />;
    case 'running':
      return <Loader2 className="h-6 w-6 animate-spin text-brand" />;
    case 'pending':
      return <Circle className="h-6 w-6 text-muted-foreground" />;
  }
};

/** The steps and the object count of a social v1 migration run (ADR-0026); presentational, the template feeds it. */
export function SocialMigrationProgress({ phase, pass, done, total, resumedFrom }: SocialMigrationProgressProps) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  return (
    <Container className="items-start justify-center gap-6" data-testid="social-migration-progress">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {STEPS.map((step) => {
          const status = getStepStatus(step.key, phase);
          const detail = step.key === 'migrating' && status === 'running' && pass ? PASS_LABELS[pass] : null;
          return (
            <div key={step.key} className="flex items-center gap-3">
              <StepIcon status={status} />
              <Typography
                as="span"
                className={cn(
                  'text-base leading-normal font-light',
                  status === 'completed' && 'font-bold text-foreground',
                  status === 'running' && 'text-foreground',
                  status === 'pending' && 'text-muted-foreground',
                )}
              >
                {step.label}
                {detail && <span className="text-muted-foreground">{` · ${detail}`}</span>}
              </Typography>
            </div>
          );
        })}
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Progress value={percent} aria-label="Migration progress" />
        <Typography as="p" size="sm" className="text-muted-foreground">
          {total > 0 ? `${done} of ${total}` : 'Preparing...'}
        </Typography>
        {resumedFrom && (
          <Typography as="p" size="sm" className="text-muted-foreground">
            Continuing from an earlier run
          </Typography>
        )}
      </div>
    </Container>
  );
}
