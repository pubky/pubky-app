'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Container } from '@/atoms/Container/Container';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { cn } from '@/libs/utils/utils';
import { getBusinessKey } from '@/models/notification/notification.helpers';
import { NotificationType } from '@/models/notification/notification.types';
import {
  NotificationActorAvatar,
  NotificationActorHeading,
  NotificationTimestampAndIcon,
} from '@/molecules/NotificationRowChrome/NotificationRowChrome';
import {
  getNotificationKindBucket,
  getUserIdFromNotification,
  getUserProfileLink,
} from '../NotificationItem/NotificationItem.utils';
import type { GroupableNotification } from '../NotificationsList/NotificationsList.types';
import { getGroupedActionText, getGroupToggleHideLabel, getGroupToggleShowLabel } from './NotificationGroupItem.utils';
import { NotificationGroupPostTitle } from './NotificationGroupPostTitle';

interface NotificationGroupItemProps {
  /** The run of notifications collapsed into this row, newest first. */
  notifications: GroupableNotification[];
  /** Whether any member of the run is unread. */
  isUnread: boolean;
  /**
   * Whether the notification list is being viewed below the desktop breakpoint.
   * Supplied by the list so rows do not each subscribe to viewport changes.
   */
  isMobile?: boolean;
  /**
   * Disclosure state owned by the list. A run's members change as pages load and
   * refreshes arrive, which can change the row's key and remount it — holding the state
   * here would silently collapse the group the user is reading. Omitted when the row is
   * rendered on its own, where it keeps its own state.
   */
  isExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
}

/**
 * A run of repeated delete/edit notifications rendered as one row.
 *
 * Deleted groups are a single flat line by design — the total is the story, and the
 * design keeps them unlinked. Edited groups keep direct access to every post through a
 * title list: collapsed behind a disclosure toggle on desktop, always expanded on
 * mobile where the list stacks vertically anyway.
 */
export function NotificationGroupItem({
  notifications,
  isUnread,
  isMobile = false,
  isExpanded: expandedProp,
  onExpandedChange,
}: NotificationGroupItemProps) {
  const [ownExpanded, setOwnExpanded] = useState(false);
  const isExpanded = expandedProp ?? ownExpanded;

  const handleExpandedChange = (next: boolean) => {
    setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  const toggleRef = useRef<HTMLButtonElement>(null);
  // On desktop the toggle relocates between the header and the disclosure block, which
  // remounts it and would drop keyboard focus on <body>.
  const shouldRestoreFocusRef = useRef(false);

  // The list is newest-first, so the head carries the timestamp to show. Every member
  // shares the type, actor and kind bucket — that is what the run was grouped on.
  const head: GroupableNotification | undefined = notifications[0];
  const count = notifications.length;
  const actorId = head ? getUserIdFromNotification(head) : '';

  const { profile } = useUserProfile(actorId);

  useEffect(() => {
    if (!shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    // preventScroll: browsers center a focused element, which would scroll the header
    // and the first titles out of view; nearest-edge keeps everything just revealed
    // visible while the control still receives focus (scrollIntoView is absent in
    // jsdom, hence the optional call).
    toggleRef.current?.focus({ preventScroll: true });
    toggleRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isExpanded]);

  if (!head) return null;

  const kindBucket = getNotificationKindBucket(head);
  const userName = profile?.name || 'User';
  const userProfileLink = actorId ? getUserProfileLink(actorId) : null;

  const timestampDate = new Date(head.timestamp);

  const isEditedGroup = head.type === NotificationType.PostEdited;
  // Mobile renders the title list permanently without a toggle, so the disclosure
  // mechanics exist only on desktop.
  const isDisclosable = isEditedGroup && !isMobile;
  // Collapsed the toggle sits inline in the header row; expanded it moves below the list.
  const showToggleInHeader = isDisclosable && !isExpanded;

  // A run groups by kind bucket, so members can mix media kinds (image, video, link…).
  // When every member shares one raw kind the icon keeps it, matching what the same
  // notifications would show as single rows; mixed runs fall back to the bucket.
  const uniformPostKind = notifications.every((notification) => notification.post_kind === head.post_kind)
    ? head.post_kind
    : undefined;

  const titleList = isEditedGroup
    ? notifications.map((notification) => (
        <NotificationGroupPostTitle key={getBusinessKey(notification)} notification={notification} />
      ))
    : null;

  const toggle = (
    <CollapsibleTrigger asChild>
      <Button
        ref={toggleRef}
        variant={ButtonVariant.SECONDARY}
        size="sm"
        type="button"
        // order-last keeps the pill rendered below the expanded list while the DOM
        // places it before the titles, so Tab moves from the toggle into the links it
        // just revealed. In the header cluster it is the last child anyway.
        className="order-last shrink-0"
        data-cy="notification-group-toggle"
        // The visible label repeats across rows, so name the control for screen
        // readers by the group it belongs to.
        aria-label={
          isExpanded
            ? getGroupToggleHideLabel(head.type, kindBucket, userName)
            : getGroupToggleShowLabel(head.type, kindBucket, count, userName)
        }
        // Only restore focus when the control was actually focused (keyboard, most
        // mouse flows); Safari mouse clicks leave it unfocused and must stay that way.
        onClick={(event) => {
          shouldRestoreFocusRef.current = document.activeElement === event.currentTarget;
        }}
      >
        {isExpanded ? 'Hide' : 'Show'}
      </Button>
    </CollapsibleTrigger>
  );

  const row = (
    <Container overrideDefaults={true} className="flex w-full min-w-0 flex-col gap-1" data-cy="notification-group">
      <Container
        overrideDefaults={true}
        className="flex w-full min-w-0 items-center justify-between gap-2"
        data-cy="notification-group-header"
      >
        <Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
          <NotificationActorAvatar
            avatarUrl={profile?.avatarUrl}
            userName={userName}
            fallbackSeed={actorId}
            userProfileLink={userProfileLink}
          />

          <NotificationActorHeading
            userName={userName}
            userProfileLink={userProfileLink}
            actionText={getGroupedActionText(head.type, kindBucket, count)}
          />

          {showToggleInHeader && toggle}
        </Container>

        <NotificationTimestampAndIcon
          timestampDate={timestampDate}
          isMobile={isMobile}
          type={head.type}
          postKind={uniformPostKind ?? kindBucket}
          showBadge={isUnread}
          className="shrink-0"
        />
      </Container>

      {isEditedGroup && (
        // Indented to the text column: avatar (size-6, size-8 on lg) plus the gap-2.
        // Stays mounted even when the toggle lives in the header, so force-mounted
        // titles survive collapsing; `hidden` then removes its stray flex gap.
        <Container
          overrideDefaults={true}
          className={cn('flex min-w-0 flex-col items-start gap-2 pl-8 lg:pl-10', showToggleInHeader && 'hidden')}
        >
          {isDisclosable ? (
            <>
              {!showToggleInHeader && toggle}

              {/* Titles unmount while closed, so their post fetches stay lazy — the
                  local-first cache makes a re-expand a cheap local re-read, and members
                  appended to the run later never fetch until actually revealed. */}
              <CollapsibleContent className="flex w-full min-w-0 flex-col gap-2">{titleList}</CollapsibleContent>
            </>
          ) : (
            <Container overrideDefaults={true} className="flex w-full min-w-0 flex-col gap-2">
              {titleList}
            </Container>
          )}
        </Container>
      )}
    </Container>
  );

  if (!isDisclosable) return row;

  return (
    <Collapsible asChild={true} open={isExpanded} onOpenChange={handleExpandedChange}>
      {row}
    </Collapsible>
  );
}
