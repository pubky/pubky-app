import type {
  THomeserverEvent,
  TSubscribeUserEventStreamParams,
} from '@/controllers/homeserver-event/homeserver-event.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

export class HomeserverEventApplication {
  private constructor() {}

  /**
   * Homeserver `/events-stream` (live) for the union of `paths` under the user's storage.
   * @see HomeserverService.subscribeUserEventStream
   */
  static subscribeUserEventStream(params: TSubscribeUserEventStreamParams): Promise<ReadableStream<THomeserverEvent>> {
    return HomeserverService.subscribeUserEventStream({
      userZ32: params.pubky,
      cursor: params.cursor,
      paths: params.paths,
      signal: params.signal,
    });
  }
}
