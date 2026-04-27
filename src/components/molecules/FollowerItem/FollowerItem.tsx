'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import { Check, UserMinus, UserRoundPlus } from 'lucide-react';
import type { FollowerItemProps } from './FollowerItem.types';
import { formatPublicKey } from '@/libs/utils/utils';

export function FollowerItem({ follower, isFollowing = false, onFollow, isCurrentUser = false }: FollowerItemProps) {
  const t = useTranslations('userList');
  const tProfile = useTranslations('profile.actions');
  const avatarUrl = follower.avatarUrl || follower.image || undefined;
  const formattedPublicKey = formatPublicKey({ key: follower.id });
  const tags = follower.tags || [];
  const stats = follower.stats || { tags: 0, posts: 0 };
  // Use formatted public key as fallback when name is loading
  const displayName = follower.name || formattedPublicKey;

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFollow?.(follower.id, isFollowing);
  };

  return (
    <Atoms.Container className="gap-3 rounded-md bg-card p-6 lg:bg-transparent lg:p-0">
      <Atoms.Container
        overrideDefaults={true}
        className="flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap"
      >
        <Atoms.Link href={`/profile/${follower.id}`} className="flex min-w-0 flex-1 items-center gap-2">
          <Organisms.AvatarWithFallback avatarUrl={avatarUrl} name={displayName} fallbackSeed={follower.id} size="md" />

          <Atoms.Container overrideDefaults={true}>
            <Atoms.Typography data-cy="profile-follower-item-name" size="sm" className="truncate font-bold">
              {displayName}
            </Atoms.Typography>
            <Atoms.Typography
              data-cy="profile-follower-item-pubky"
              className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase"
            >
              {formattedPublicKey}
            </Atoms.Typography>
          </Atoms.Container>
        </Atoms.Link>

        {/* Desktop: Tags (inline) */}
        {tags.length > 0 && (
          <Atoms.Container overrideDefaults={true} className="hidden flex-wrap items-center gap-2 lg:flex">
            {tags.slice(0, 3).map((tag, index) => (
              <Atoms.Tag key={index} name={tag} />
            ))}
          </Atoms.Container>
        )}

        {/* Stats */}
        <Atoms.Container overrideDefaults={true} className="flex shrink-0 items-center gap-3">
          <Atoms.Container className="items-start">
            <Atoms.Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
              {t('tags')}
            </Atoms.Typography>
            <Atoms.Typography data-cy="profile-follower-item-tags-count" size="sm" className="font-bold">
              {stats.tags}
            </Atoms.Typography>
          </Atoms.Container>
          <Atoms.Container className="items-start">
            <Atoms.Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
              {t('posts')}
            </Atoms.Typography>
            <Atoms.Typography data-cy="profile-follower-item-posts-count" size="sm" className="font-bold">
              {stats.posts}
            </Atoms.Typography>
          </Atoms.Container>
        </Atoms.Container>

        {/* Desktop: Follow Button */}
        {isCurrentUser ? (
          <Atoms.Button
            data-cy="user-list-item-me-btn"
            variant="secondary"
            size="sm"
            className="hidden w-[110px] justify-center lg:flex"
            disabled
            aria-label={tProfile('thisIsYou')}
          >
            <span>{t('me')}</span>
          </Atoms.Button>
        ) : (
          <Atoms.Button
            data-cy="user-list-item-follow-toggle-btn"
            variant="secondary"
            size="sm"
            className="group hidden w-[110px] justify-center lg:flex"
            onClick={handleFollowClick}
            aria-label={isFollowing ? t('unfollow') : t('follow')}
          >
            {isFollowing ? (
              <>
                <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                  <Check className="size-4" />
                  <span>{t('following')}</span>
                </Atoms.Container>
                <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                  <UserMinus className="size-4" />
                  <span>{t('unfollow')}</span>
                </Atoms.Container>
              </>
            ) : (
              <>
                <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                  <UserRoundPlus className="size-4" />
                  <span>{t('follow')}</span>
                </Atoms.Container>
                <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                  <Check className="size-4" />
                  <span>{t('follow')}</span>
                </Atoms.Container>
              </>
            )}
          </Atoms.Button>
        )}
      </Atoms.Container>

      {/* Mobile: Bottom row - Tags and Follow Button */}
      <Atoms.Container overrideDefaults={true} className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        {/* Left: Tags */}
        {tags.length > 0 && (
          <Atoms.Container overrideDefaults={true} className="flex flex-1 flex-wrap items-center gap-2">
            {tags.slice(0, 3).map((tag, index) => (
              <Atoms.Tag key={index} name={tag} />
            ))}
          </Atoms.Container>
        )}
        {/* Right: Follow Button */}
        {isCurrentUser ? (
          <Atoms.Button
            variant="secondary"
            size="sm"
            className="w-[110px] justify-center"
            disabled
            aria-label={tProfile('thisIsYou')}
          >
            <span>{t('me')}</span>
          </Atoms.Button>
        ) : (
          <Atoms.Button
            variant="secondary"
            size="sm"
            className="group w-[110px] justify-center"
            onClick={handleFollowClick}
            aria-label={isFollowing ? t('unfollow') : t('follow')}
          >
            {isFollowing ? (
              <>
                <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                  <Check className="size-4" />
                  <span>{t('following')}</span>
                </Atoms.Container>
                <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                  <UserMinus className="size-4" />
                  <span>{t('unfollow')}</span>
                </Atoms.Container>
              </>
            ) : (
              <>
                <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                  <UserRoundPlus className="size-4" />
                  <span>{t('follow')}</span>
                </Atoms.Container>
                <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                  <Check className="size-4" />
                  <span>{t('follow')}</span>
                </Atoms.Container>
              </>
            )}
          </Atoms.Button>
        )}
      </Atoms.Container>
    </Atoms.Container>
  );
}
