'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { GitBranch } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { GRAPH_SURFACE_CLASS } from '@/config/theme';
import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import { facepileCandidates } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { useUserInfoPopoverActions } from '@/hooks/useUserInfoPopoverActions/useUserInfoPopoverActions';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { AvatarGroupItem } from '@/molecules/AvatarGroup/AvatarGroup.types';
import { CanvasAnchoredPopover } from '@/molecules/CanvasAnchoredPopover/CanvasAnchoredPopover';
import { PostText } from '@/molecules/PostText/PostText';
import { UserInfoPopoverFollowButton } from '@/molecules/UserInfoPopover/components/UserInfoPopoverFollowButton/UserInfoPopoverFollowButton';
import { UserInfoPopoverHeader } from '@/molecules/UserInfoPopover/components/UserInfoPopoverHeader/UserInfoPopoverHeader';
import { UserInfoPopoverStats } from '@/molecules/UserInfoPopover/components/UserInfoPopoverStats/UserInfoPopoverStats';
import type { GraphUserHoverCardProps } from './GraphUserHoverCard.types';

const MAX_AVATARS = 3;

/**
 * GraphUserHoverCard
 *
 * The design's UserHover card for graph surfaces, with a hard zero-network
 * contract: identity comes from the node payload, bio/counts/follow state
 * from local-only live queries (the graph ingestion pipeline fills those
 * rows), and facepiles from edges already on canvas. Hovering never fires a
 * request; cold rows render as skeleton lines until ingestion lands.
 */
export function GraphUserHoverCard({
  node,
  open,
  x,
  y,
  nodes,
  edges,
  meId,
  onTraceConnection,
  onPointerEnter,
  onPointerLeave,
  className,
}: GraphUserHoverCardProps) {
  const pubky = node.pubky;
  const isSelf = meId === node.id;

  // Local-only reads; undefined = still loading (or cold cache)
  const local = useLiveQuery(async () => {
    const [details, counts, relationships] = await Promise.all([
      UserController.getManyDetails({ userIds: [pubky] }),
      UserController.getManyCounts({ userIds: [pubky] }),
      UserController.getManyRelationships({ userIds: [pubky] }),
    ]);
    return {
      details: details.get(pubky) ?? null,
      counts: counts.get(pubky) ?? null,
      relationship: relationships.get(pubky) ?? null,
    };
  }, [pubky]);

  const userName = local?.details?.name || node.name || formatPublicKey({ key: pubky });
  const isFollowing = Boolean(local?.relationship?.following);

  const { isLoading: isActionLoading, onFollowClick } = useUserInfoPopoverActions({
    userId: pubky,
    isCurrentUser: isSelf,
    isFollowing,
    isFollowingStatusLoading: local === undefined,
  });

  // Facepiles strictly from the canvas: neighbors already on screen
  const toItems = (ids: string[]): AvatarGroupItem[] =>
    ids.flatMap((id) => {
      const neighbor = nodes.find((n) => n.id === id);
      if (!neighbor || neighbor.kind !== 'user') return [];
      return [
        {
          id: neighbor.pubky,
          name: neighbor.name || neighbor.pubky,
          avatarUrl: neighbor.image ? FileController.getAvatarUrl(neighbor.pubky) : undefined,
        },
      ];
    });
  const followersAvatars = toItems(facepileCandidates(node.id, edges, meId, 'followers', MAX_AVATARS));
  const followingAvatars = toItems(facepileCandidates(node.id, edges, meId, 'following', MAX_AVATARS));

  if (!open) return null;

  return (
    <CanvasAnchoredPopover
      x={x}
      y={y}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(GRAPH_SURFACE_CLASS, 'flex w-[280px] flex-col gap-3 p-4 shadow-xl shadow-background/50', className)}
      data-cy="graph-hover-card"
    >
      <UserInfoPopoverHeader
        userId={pubky}
        userName={userName}
        formattedPublicKey={formatPublicKey({ key: pubky })}
        avatarUrl={local?.details?.image || node.image ? FileController.getAvatarUrl(pubky) : undefined}
      />
      {local === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          {local.details?.bio ? (
            <div className="max-h-24 overflow-y-auto">
              <PostText content={local.details.bio} />
            </div>
          ) : null}
          <UserInfoPopoverStats
            followersCount={local.counts?.followers ?? followersAvatars.length}
            followingCount={local.counts?.following ?? followingAvatars.length}
            followersAvatars={followersAvatars}
            followingAvatars={followingAvatars}
            maxAvatars={MAX_AVATARS}
          />
        </>
      )}
      {!isSelf && (
        <>
          <UserInfoPopoverFollowButton isFollowing={isFollowing} isLoading={isActionLoading} onClick={onFollowClick} />
          {meId && onTraceConnection && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => onTraceConnection(pubky as Pubky)}
              data-cy="graph-hover-trace"
            >
              <GitBranch className="size-4" />
              {'How are we connected?'}
            </Button>
          )}
        </>
      )}
    </CanvasAnchoredPopover>
  );
}
