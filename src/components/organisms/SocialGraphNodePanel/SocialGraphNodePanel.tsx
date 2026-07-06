'use client';

import { useState } from 'react';
import { Loader2, MessageCircle, Route, Waypoints, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, getUserProfileUrl, POST_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import { FileController } from '@/controllers/file/file';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import type { GraphRelationship } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { AvatarGroup } from '@/molecules/AvatarGroup/AvatarGroup';
import { FollowButton } from '@/molecules/FollowButton/FollowButton';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { DialogReply } from '../DialogReply/DialogReply';
import type { SocialGraphNodePanelProps } from './SocialGraphNodePanel.types';

const RELATIONSHIP_DOT: Record<GraphRelationship, string> = {
  self: 'bg-brand',
  friend: 'bg-(--chart-2)',
  following: 'bg-(--chart-3)',
  follower: 'bg-(--chart-1)',
  extended: 'bg-muted-foreground',
};

/**
 * SocialGraphNodePanel
 *
 * Kind-aware inspector for the selected graph node: user card with follow,
 * social proof, trace-path and focus actions; post nodes render the app's
 * real post preview with reply-in-place; tags get their summary.
 */
export function SocialGraphNodePanel({
  node,
  relationship,
  isExpanded,
  isExpanding,
  proofUsers,
  onProofHover,
  onExpand,
  onRefreshNode,
  onFocus,
  onTracePath,
  isTracing,
  onClose,
  className,
}: SocialGraphNodePanelProps) {
  const t = useTranslations('graph');
  const { currentUserPubky } = useAuthStore();
  const targetPubky = node.kind === 'user' ? node.pubky : '';
  const { isFollowing } = useIsFollowing(targetPubky);
  const { toggleFollow, isUserLoading } = useFollowUser();
  const [replyOpen, setReplyOpen] = useState(false);
  // Keep the pinned profile fresh while it is on screen, like other user
  // surfaces do (posts get the same treatment inside PostPreviewCard)
  const { ref: ttlRef } = useTtlSubscription({ type: 'user', id: targetPubky });

  const expandButton = (
    <Button
      variant="secondary"
      size="sm"
      className="flex-1"
      disabled={isExpanded || isExpanding}
      onClick={() => onExpand(node.id)}
      data-cy="graph-panel-expand"
    >
      {isExpanding ? <Loader2 className="size-4 animate-spin" /> : <Waypoints className="size-4" />}
      {isExpanded ? t('panel.expanded') : t('panel.expand')}
    </Button>
  );

  return (
    <div
      className={cn(
        GLASS_PANEL_CLASS,
        'flex w-80 flex-col gap-3 bg-black/60 p-3 shadow-lg lg:gap-4 lg:bg-black/40 lg:p-4',
        className,
      )}
      data-cy="graph-panel"
    >
      <div className="flex items-center justify-between">
        <Typography size="sm" className="font-medium text-muted-foreground uppercase">
          {t(`legend.${node.kind}`)}
        </Typography>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t('panel.close')}>
          <X className="size-4" />
        </Button>
      </div>

      {node.kind === 'user' && (
        <>
          <div ref={ttlRef} className="flex items-center gap-3">
            <AvatarWithFallback
              avatarUrl={node.image ? FileController.getAvatarUrl(node.pubky) : undefined}
              name={node.name}
              fallbackSeed={node.pubky}
              size="lg"
            />
            <div className="min-w-0">
              <Typography as="p" className="truncate font-semibold">
                {node.name || formatPublicKey({ key: node.pubky })}
              </Typography>
              <Typography as="p" size="sm" className="truncate text-muted-foreground">
                {formatPublicKey({ key: node.pubky })}
              </Typography>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', RELATIONSHIP_DOT[relationship])} />
                <Typography size="sm" className="text-muted-foreground">
                  {t(`legend.${relationship}`)}
                </Typography>
              </div>
            </div>
          </div>

          {proofUsers.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5 text-left transition-colors hover:bg-white/10"
              onMouseEnter={() => onProofHover(true)}
              onMouseLeave={() => onProofHover(false)}
              data-cy="graph-panel-proof"
            >
              <AvatarGroup
                items={proofUsers.slice(0, 4).map((user) => ({
                  id: user.pubky,
                  name: user.name,
                  avatarUrl: user.image ? FileController.getAvatarUrl(user.pubky) : undefined,
                }))}
                totalCount={proofUsers.length}
                maxAvatars={4}
              />
              <Typography size="sm" className="text-muted-foreground">
                {t('panel.followedBy', { count: proofUsers.length })}
              </Typography>
            </button>
          )}

          <div className="flex gap-2">
            {expandButton}
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => onFocus(node.id)}
              data-cy="graph-panel-focus"
            >
              {t('panel.focus')}
            </Button>
          </div>

          <div className="flex gap-2">
            {currentUserPubky && currentUserPubky !== node.pubky && (
              <FollowButton
                className="flex-1"
                isFollowing={isFollowing}
                isLoading={isUserLoading(node.pubky)}
                onClick={() => toggleFollow(node.pubky, isFollowing, node.name)}
              />
            )}
            <Button variant="secondary" size="sm" className="flex-1" asChild>
              <Link href={getUserProfileUrl(node.pubky, currentUserPubky)}>{t('panel.openProfile')}</Link>
            </Button>
          </div>

          {currentUserPubky && currentUserPubky !== node.pubky && (
            <Button
              variant="secondary"
              size="sm"
              disabled={isTracing}
              onClick={() => onTracePath(node.pubky)}
              data-cy="graph-panel-trace"
            >
              {isTracing ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
              {t('panel.tracePath')}
            </Button>
          )}
        </>
      )}

      {node.kind === 'post' && (
        <>
          <PostPreviewCard postId={`${node.author_id}:${node.post_id}`} />
          <div className="flex gap-2">
            {expandButton}
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setReplyOpen(true)}
              data-cy="graph-panel-reply"
            >
              <MessageCircle className="size-4" />
              {t('panel.reply')}
            </Button>
          </div>
          <Button variant="secondary" size="sm" className="w-full" asChild>
            <Link href={`${POST_ROUTES.POST}/${node.author_id}/${node.post_id}`}>{t('panel.openPost')}</Link>
          </Button>
          <DialogReply
            postId={`${node.author_id}:${node.post_id}`}
            open={replyOpen}
            onOpenChangeAction={(open) => {
              setReplyOpen(open);
              // Refresh on close: if a reply was posted it pops into the graph
              if (!open) onRefreshNode(node.id);
            }}
          />
        </>
      )}

      {node.kind === 'tag' && (
        <>
          <div className="flex items-center gap-2">
            <Tag name={node.label} />
            <Typography size="sm" className="text-muted-foreground">
              {t('panel.tagUsage', { count: node.count })}
            </Typography>
          </div>
          <div className="flex gap-2">
            {expandButton}
            <Button variant="secondary" size="sm" className="flex-1" asChild>
              <Link href={`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(node.label)}`}>{t('panel.searchTag')}</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
