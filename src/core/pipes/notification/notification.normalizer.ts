import { LastReadResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { getBusinessKey } from '@/core/models/notification/notification.helpers';
import type { NotificationPreferences } from '@/core/stores/settings/settings.types';
import { NotificationType } from '@/core/models/notification/notification.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { NOTIFICATION_TYPE_TO_PREFERENCE_KEY } from './notification.constants';

export class NotificationNormalizer {
  private constructor() {}

  static to(pubky: Core.Pubky): LastReadResult {
    try {
      const builder = Core.PubkySpecsSingleton.get(pubky);
      return builder.createLastRead();
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createLastRead',
        context: { pubky },
      });
    }
  }

  static toFlatNotification(nexusNotification: Core.NexusNotification): Core.FlatNotification {
    // First create the notification without id to generate business key
    const notificationWithoutId = {
      timestamp: nexusNotification.timestamp,
      ...nexusNotification.body,
    } as Core.FlatNotification;

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
