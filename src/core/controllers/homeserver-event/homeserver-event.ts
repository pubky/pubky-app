import { HomeserverEventApplication } from '@/application/homeserver-event/homeserver-event';
import type {
  THomeserverEvent,
  TSubscribeUserEventStreamParams,
} from '@/controllers/homeserver-event/homeserver-event.types';

export class HomeserverEventController {
  private constructor() {}

  /**
   * Live homeserver event stream for the union of `paths` under the user's storage.
   * @see HomeserverEventApplication.subscribeUserEventStream
   */
  static subscribeUserEventStream(params: TSubscribeUserEventStreamParams): Promise<ReadableStream<THomeserverEvent>> {
    return HomeserverEventApplication.subscribeUserEventStream(params);
  }
}
