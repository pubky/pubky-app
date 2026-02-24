'use client';

import * as React from 'react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';

const RANDOM_FEED_NAMES = ['Bitcoin Alpha', 'Lightning Pulse', 'Nostr Vibes', 'Mining Daily', 'Crypto Digest'];
const RANDOM_TAGS = ['bitcoin', 'lightning', 'nostr', 'mining', 'crypto', 'defi', 'privacy', 'freedom'];
const REACH_OPTIONS = [PubkyAppFeedReach.All, PubkyAppFeedReach.Following, PubkyAppFeedReach.Friends, PubkyAppFeedReach.Followers];
const SORT_OPTIONS = [PubkyAppFeedSort.Recent, PubkyAppFeedSort.Popularity];
const LAYOUT_OPTIONS = [PubkyAppFeedLayout.Columns, PubkyAppFeedLayout.Wide, PubkyAppFeedLayout.Visual];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomTags(): string[] {
  const count = Math.floor(Math.random() * 3) + 1;
  const shuffled = [...RANDOM_TAGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============================================================================
// Shared Components
// ============================================================================

/**
 * FeedActions
 *
 * Create Feed button and Edit Feed input + button for the sidebar.
 */
function FeedActions() {
  const [feedId, setFeedId] = React.useState('');

  const handleCreateFeed = async () => {
    try {
      const params: Core.TFeedCreateParams = {
        name: pickRandom(RANDOM_FEED_NAMES) + ' ' + Date.now().toString(36),
        tags: pickRandomTags(),
        reach: pickRandom(REACH_OPTIONS),
        sort: pickRandom(SORT_OPTIONS),
        content: null,
        layout: pickRandom(LAYOUT_OPTIONS),
      };
      await Core.FeedController.commitCreate(params);
    } catch (error) {
      Libs.Logger.error('Failed to create feed', error);
    }
  };

  const handleEditFeed = async () => {
    const trimmed = feedId.trim();
    if (!trimmed) return;

    try {
      const params: Core.TFeedUpdateParams = {
        feedId: trimmed,
        changes: {
          //tags: pickRandomTags(),
          reach: pickRandom(REACH_OPTIONS),
          sort: pickRandom(SORT_OPTIONS),
          content: null,
          layout: pickRandom(LAYOUT_OPTIONS),
        },
      };
      await Core.FeedController.commitUpdate(params);
    } catch (error) {
      Libs.Logger.error('Failed to edit feed', error);
    }
  };

  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-3">
      <Atoms.Button variant="brand" className="w-full" onClick={handleCreateFeed}>
        <Libs.Plus className="size-4" />
        Create Feed
      </Atoms.Button>

      <Atoms.Container overrideDefaults className="flex gap-2">
        <Atoms.Input
          placeholder="Feed ID..."
          value={feedId}
          onChange={(e) => setFeedId(e.target.value)}
          className="flex-1"
        />
        <Atoms.Button variant="outline" size="sm" className="shrink-0 self-center" onClick={handleEditFeed}>
          <Libs.Pencil className="size-3.5" />
          Edit Feed
        </Atoms.Button>
      </Atoms.Container>
    </Atoms.Container>
  );
}

/**
 * HomeFeedContent
 *
 * Shared content for Home feed sidebars - WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 * Used by both HomeFeedRightSidebar (desktop) and HomeFeedRightDrawer (tablet).
 */
function HomeFeedContent() {
  return (
    <>
      <Organisms.WhoToFollow />
      <Organisms.ActiveUsers />
      <Organisms.HotTags />
      <Organisms.FeedbackCard />
      <FeedActions />
    </>
  );
}

// ============================================================================
// Home Feed Right Sidebar Components
// ============================================================================

/**
 * HomeFeedRightSidebar
 *
 * Right sidebar for Home feed - displays WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 * Desktop version.
 */
export function HomeFeedRightSidebar() {
  return <HomeFeedContent />;
}

/**
 * HomeFeedRightDrawer
 *
 * Right drawer for Home feed (tablet) - displays WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 */
export function HomeFeedRightDrawer() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-6">
      <HomeFeedContent />
    </Atoms.Container>
  );
}

/**
 * HomeFeedRightDrawerMobile
 *
 * Right drawer for Home feed (mobile) - displays FeedSection.
 */
export function HomeFeedRightDrawerMobile() {
  return (
    <Molecules.FeedSection
      feeds={[
        { icon: Libs.UsersRound, label: 'Following' },
        { icon: Libs.Pencil, label: 'Based bitcoin' },
        { icon: Libs.Pencil, label: 'Mining industry' },
      ]}
      showCreateButton={true}
    />
  );
}

// ============================================================================
// Hot Feed Right Sidebar Components
// ============================================================================

/**
 * HotFeedRightSidebar
 *
 * Right sidebar for Hot feed - displays WhoToFollow, FeedbackCard.
 * Desktop version with sticky positioning.
 */
export function HotFeedRightSidebar() {
  return (
    <>
      <Organisms.WhoToFollow />
      <Atoms.Container overrideDefaults className="sticky top-[100px] self-start">
        <Organisms.FeedbackCard />
      </Atoms.Container>
    </>
  );
}

/**
 * HotFeedRightDrawer
 *
 * Right drawer for Hot feed (tablet/mobile) - displays WhoToFollow, FeedbackCard.
 */
export function HotFeedRightDrawer() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-6">
      <Organisms.WhoToFollow />
      <Organisms.FeedbackCard />
    </Atoms.Container>
  );
}
