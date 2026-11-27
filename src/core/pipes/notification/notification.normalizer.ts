import { getBusinessKey } from '@/models/notification/notification.helpers';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { toLocalPostKindFromNexus } from '@/pipes/post/post.kind';
import type { NexusNotification } from '@/services/nexus/nexus.types';
import type { NotificationPreferences } from '@/stores/settings/settings.types';
import { NOTIFICATION_TYPE_TO_PREFERENCE_KEY } from './notification.constants';

export class NotificationNormalizer {
  private constructor() {}

  static toFlatNotification(nexusNotification: NexusNotification): FlatNotification {
    const { post_kind, ...body } = nexusNotification.body;
    // First create the notification without id to generate business key
    const notificationWithoutId = {
      timestamp: nexusNotification.timestamp,
      ...body,
      ...(post_kind !== undefined && { post_kind: this.toLocalKind(post_kind) }),
    } as FlatNotification;

    // Generate id from business key for natural deduplication
    const id = getBusinessKey(notificationWithoutId);

    return {
      ...notificationWithoutId,
      id,
    };
  }

  /**
   * Nexus `/v1` serves the subject post's kind as stored (`note`, `article`); the local tables keep
   * `short`/`long`, so it crosses the vocabulary like every other Nexus post read
   * (`toLocalPostKindFromNexus`, fail-open). A value that is no string is kept as served.
   */
  private static toLocalKind(postKind: unknown): unknown {
    return typeof postKind === 'string' ? toLocalPostKindFromNexus(postKind) : postKind;
  }

  /**
   * Returns the list of NotificationType values that are enabled in the given preferences.
   * Used by callers that need to convert settings preferences to domain notification types.
   */
  static toEnabledTypes(preferences: NotificationPreferences): NotificationType[] {
    return Object.values(NotificationType).filter((type) => preferences[NOTIFICATION_TYPE_TO_PREFERENCE_KEY[type]]);
  }
}
