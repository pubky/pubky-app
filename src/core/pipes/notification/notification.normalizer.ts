import { LastReadResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { getBusinessKey } from '@/core/models/notification/notification.helpers';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

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
}
