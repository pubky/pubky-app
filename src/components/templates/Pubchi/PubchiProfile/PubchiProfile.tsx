'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Brain, Settings, Smartphone } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiCapabilities } from '@/components/organisms/Pubchi/PubchiCapabilities/PubchiCapabilities';
import { PubchiProfileCard } from '@/components/organisms/Pubchi/PubchiProfileCard/PubchiProfileCard';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { subscribeToPubchiSync } from '@/controllers/pubchi/pubchi-sync';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { effectiveTier } from '@/libs/pubchi/effective-tier';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { useAuthStore } from '@/stores/auth/auth.store';

export function PubchiProfile() {
  const { pubchi, config, context, devices, needsReapproval } = usePubchiEnrollment();
  const owner = useAuthStore((state) => state.currentUserPubky);
  const pubchiBot = pubchi?.bot;
  const [builtFeeds, setBuiltFeeds] = useState<Array<{ feed: FeedModelSchema; createdAt: number }>>([]);
  const [builtFeedsError, setBuiltFeedsError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!owner || !pubchiBot) {
      setBuiltFeeds([]);
      setBuiltFeedsError(false);
      return;
    }
    let cancelled = false;
    setBuiltFeedsError(false);
    void Promise.all([FeedController.getList(), PubchiController.fetchBuiltFeedProvenance()])
      .then(([feeds, provenance]) => {
        const feedsById = new Map(feeds.map((feed) => [feed.id, feed]));
        const joined = provenance.flatMap((record) => {
          const feed = feedsById.get(record.feed_id);
          return feed ? [{ feed, createdAt: record.created_at }] : [];
        });
        if (!cancelled) setBuiltFeeds(joined);
      })
      .catch(() => {
        if (!cancelled) {
          setBuiltFeeds([]);
          setBuiltFeedsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [owner, pubchiBot, reload]);

  useEffect(() => {
    if (!owner) return;
    return subscribeToPubchiSync((message) => {
      if (message.owner === owner && (message.kind === 'created' || message.kind === 'removed')) {
        setReload((value) => value + 1);
      }
    });
  }, [owner]);

  if (!pubchi) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Typography size="xl" className="font-semibold">
          Your Pubchi
        </Typography>
        <Card>
          <CardContent className="p-6">
            <Typography>Your Pubchi has not been created yet.</Typography>
            <Link href="/settings/pubchi" className="mt-3 inline-flex items-center gap-2">
              Create it in Settings <ArrowRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const tier = effectiveTier({
    desired: config?.tier ?? 'read-only',
    ceiling: 'assisted',
    sessionCoversPubchi: !needsReapproval,
  });
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      data-surface="pubchi-profile-page"
      data-testid="pubchi-profile-page"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <Typography size="xl" className="font-semibold">
            Your Pubchi
          </Typography>
          <Typography className="text-muted-foreground">Your graph assistant and its permissions.</Typography>
        </div>
        <Link href="/settings/pubchi" className="inline-flex items-center gap-2">
          <Settings aria-hidden="true" /> Settings
        </Link>
      </div>
      <PubchiProfileCard
        bot={pubchi.bot}
        displayName={pubchi.displayName}
        createdAt={pubchi.createdAt}
        verified={pubchi.verified}
        backupConfirmed={Boolean(pubchi.backupConfirmedAt)}
        tier={tier}
        brainLabel={config?.brain.execution === 'self-hosted' ? 'Own endpoint' : 'Hosted Kimi'}
      />
      <Card data-testid="pubchi-brain-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain aria-hidden="true" /> Brain
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Typography size="sm">
            <span className="font-medium">About you:</span> {truncateBrainValue(context?.about)}
          </Typography>
          <Typography size="sm">
            <span className="font-medium">How to answer:</span> {truncateBrainValue(context?.instructions)}
          </Typography>
          <Link href={APP_ROUTES.PUBCHI_BRAIN} className="inline-flex items-center gap-2 self-start">
            Edit brain <ArrowRight aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
      <PubchiCapabilities tier={tier} onSelect={() => undefined} onBuildFeed={() => undefined} />
      <Card data-testid="pubchi-built-feeds">
        <CardHeader>
          <CardTitle>Feeds built by your Pubchi</CardTitle>
        </CardHeader>
        <CardContent>
          {builtFeeds.length === 0 ? (
            builtFeedsError ? (
              <div className="flex items-center justify-between gap-3">
                <Typography size="sm" className="text-muted-foreground">
                  Could not load Pubchi-built feeds.
                </Typography>
                <button type="button" onClick={() => setReload((value) => value + 1)} className="underline">
                  Retry
                </button>
              </div>
            ) : (
              <Typography size="sm" className="text-muted-foreground">
                No Pubchi-built feeds yet. Build one from the Pubchi flyout.
              </Typography>
            )
          ) : (
            <ul className="flex flex-col gap-3">
              {builtFeeds.map(({ feed, createdAt }) => (
                <li key={feed.id} className="flex items-center justify-between gap-3">
                  <div>
                    <Typography className="font-medium">{feed.name}</Typography>
                    <Typography size="sm" className="text-muted-foreground">
                      {feed.tags.length > 0 ? feed.tags.join(', ') : 'No tags'} · {feed.reach}
                    </Typography>
                    <Typography size="sm" className="text-muted-foreground">
                      Created {new Date(createdAt * 1000).toLocaleDateString()}
                    </Typography>
                  </div>
                  <Link href={`${APP_ROUTES.FEED}/${feed.id}`} className="inline-flex items-center gap-2">
                    Open <ArrowRight aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() =>
                      PubchiController.openFlyout({
                        question: `Update my feed ${feed.name}`,
                        source: 'chip',
                        feedId: feed.id,
                      })
                    }
                  >
                    Edit with Pubchi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card data-testid="pubchi-devices">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone aria-hidden="true" /> Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <Typography>
            {devices.length} device signer{devices.length === 1 ? '' : 's'}
          </Typography>
          <Link href="/settings/pubchi" className="inline-flex items-center gap-2">
            Manage <ArrowRight aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pubchi settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">
            <Link href="/settings/pubchi#rename">Rename</Link>
          </Badge>
          <Badge variant="outline">
            <Link href="/settings/pubchi#tier">Permission tier</Link>
          </Badge>
          <Badge variant="outline">
            <Link href="/settings/pubchi#brain">Brain</Link>
          </Badge>
          <Badge variant="outline">
            <Link href="/settings/pubchi#preferences">Preferences</Link>
          </Badge>
        </CardContent>
      </Card>
    </main>
  );
}

function truncateBrainValue(value: string | undefined): string {
  if (!value) return 'Not set';
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}
