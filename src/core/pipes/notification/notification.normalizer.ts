import { LastReadResult } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { getBusinessKey } from '@/models/notification/notification.helpers';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import type { NexusNotification } from '@/services/nexus/nexus.types';
import type { NotificationPreferences } from '@/stores/settings/settings.types';
import { NOTIFICATION_TYPE_TO_PREFERENCE_KEY } from './notification.constants';

export class NotificationNormalizer {
  private constructor() {}

  static to(pubky: Pubky): LastReadResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createLastRead();
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createLastRead',
        context: { pubky },
      });
    }
  }

  static toFlatNotification(nexusNotification: NexusNotification): FlatNotification {
    // First create the notification without id to generate business key
    const notificationWithoutId = {
      timestamp: nexusNotification.timestamp,
      ...nexusNotification.body,
    } as FlatNotification;

    // Generate id from business key for natural deduplication
    const id = getBusinessKey(notificationWithoutId);

    return {
      ...notificationWithoutId,
      id,
    };
  }

  /**
   * Returns the list of NotificationType values that are enabled in the given preferences.
   * Used by callers that need to convert settings preferences to domain notification types.
   */
  static toEnabledTypes(preferences: NotificationPreferences): NotificationType[] {
    return Object.values(NotificationType).filter((type) => preferences[NOTIFICATION_TYPE_TO_PREFERENCE_KEY[type]]);
  }
}
