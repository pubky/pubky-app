import { AUTH_ROUTES } from '@/app/routes';
import {
  MESSAGES_CONVERSATIONS_EVERY_TICKS,
  MESSAGES_DISCOVERY_EVERY_TICKS,
  MESSAGES_TICK_MS,
} from '@/config/messages';
import { MessagesController } from '@/controllers/messages/messages';
import { Coordinator } from '@/coordinators/base/coordinator';
import type { PollingServiceConfig, PollingServiceState } from '@/coordinators/base/coordinators.types';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import { Logger } from '@/libs/logger/logger';
import { useMessagesStore } from '@/stores/messages/messages.store';

/** While Messages is locked, its status is checked again every this many ticks. */
const LOCKED_STATUS_EVERY_TICKS = 6;

/**
 * Polls direct messages: the open conversation on every tick, every known conversation every
 * 30 s, and follows and followers for new conversations every 3 min. Pauses while the page is
 * hidden. Homeservers have no inbox, so polling is the only way to learn about new messages.
 */
export class MessagesCoordinator extends Coordinator<PollingServiceConfig, PollingServiceState> {
  private static instance: MessagesCoordinator | null = null;

  private tick = 0;
  /** Ticks since Messages became ready; the first ready tick syncs everything and discovers at once. */
  private readyTicks = 0;
  private inFlight = false;
  private readonly disabledRoutes = [
    routeToRegex('/onboarding'),
    routeToRegex(AUTH_ROUTES.LOGOUT),
    routeToRegex(AUTH_ROUTES.SIGN_IN),
    routeToRegex(AUTH_ROUTES.MIGRATION),
  ];

  private constructor() {
    super({ initialConfig: { intervalMs: MESSAGES_TICK_MS, pollOnStart: true, respectPageVisibility: true } });
  }

  public static getInstance(): MessagesCoordinator {
    if (!MessagesCoordinator.instance) MessagesCoordinator.instance = new MessagesCoordinator();
    return MessagesCoordinator.instance;
  }

  public static resetInstance(): void {
    MessagesCoordinator.instance?.destroy();
    MessagesCoordinator.instance = null;
  }

  protected async poll(): Promise<void> {
    // A slow homeserver can outlast a tick; never stack polls.
    if (this.inFlight) return;
    this.inFlight = true;
    const tick = this.tick++;
    try {
      const { status } = useMessagesStore.getState();
      if (status !== 'ready') {
        this.readyTicks = 0;
        if (status === 'unknown' || tick % LOCKED_STATUS_EVERY_TICKS === 0) await MessagesController.fetchStatus();
        if (useMessagesStore.getState().status !== 'ready') return;
      }
      const readyTick = this.readyTicks++;
      const { activePeer } = useMessagesStore.getState();
      if (activePeer) await MessagesController.fetchConversation(activePeer);
      if (readyTick % MESSAGES_CONVERSATIONS_EVERY_TICKS === 0) await MessagesController.fetchConversations();
      if (readyTick % MESSAGES_DISCOVERY_EVERY_TICKS === 0) await MessagesController.fetchDiscovery();
    } catch (error) {
      Logger.warn('[messages] poll failed', { error });
    } finally {
      this.inFlight = false;
    }
  }

  protected isRouteAllowed(): boolean {
    const route = this.getState().currentRoute;
    return !this.disabledRoutes.some((pattern) => pattern.test(route));
  }
}
