import {
  ConnectUrlOptions,
  ExchangeFrontendSessionCodeOptions,
  Locks,
  LocksOptions,
  type Session as LocksSdkSession,
  SetLockServicePointerOptions,
} from '@pubky/locks-sdk';
import { getHomeserver, getPkarrRelays, getTestnet } from '@/config/network';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import type {
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TLocksSessionResult,
  TRestoreLocksSessionParams,
} from './locksAuth.types';

/** Opt-in flag telling the Lock Server `/connect` shell to deliver the code via postMessage
 * instead of redirecting back to `returnTo`. */
const DELIVERY_POSTMESSAGE = 'postmessage';

/**
 * IO boundary for Lock Server auth via the locks-sdk.
 * Reads pkarr relays / testnet homeserver from network config, like `HomeserverService`.
 */
export class LocksAuthService {
  private constructor() {} // Prevent instantiation

  /** Builds a Locks client bound to the given Lock Server, using the app's network config. */
  private static buildLocksClient(lockServerPubky: string): Locks {
    const options = new LocksOptions();
    for (const relay of getPkarrRelays()) {
      options.addPkarrRelay(relay);
    }
    if (getTestnet()) {
      options.setLocalTestnetHomeserver(getHomeserver());
    }
    return Locks.forServerWithOptions(lockServerPubky, options);
  }

  /**
   * Builds the Lock-Server-hosted `/connect` URL (resolves the server via pkarr) and opts into
   * postMessage delivery so the shell posts the code to the parent instead of redirecting.
   */
  static async generateConnectUrl({ lockServerPubky, returnTo, state }: TGenerateConnectUrlParams): Promise<string> {
    try {
      const locks = this.buildLocksClient(lockServerPubky);
      const url = await locks.createConnectUrl(new ConnectUrlOptions(returnTo, state));
      const withDelivery = new URL(url);
      withDelivery.searchParams.set('delivery', DELIVERY_POSTMESSAGE);
      return withDelivery.toString();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksAuthService.generateConnectUrl');
    }
  }

  /** Exchanges the one-time callback code for a Locks session. */
  static async exchangeSessionCode({
    lockServerPubky,
    code,
    state,
  }: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    try {
      const locks = this.buildLocksClient(lockServerPubky);
      const session = await locks.exchangeFrontendSessionCode(new ExchangeFrontendSessionCodeOptions(code, state));
      // secret is freshly minted here — export it so the caller can persist it.
      return { session, secret: session.exportSecret() };
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksAuthService.exchangeSessionCode');
    }
  }

  /** Restores a Locks session from a persisted bearer secret. */
  static restoreSession({ lockServerPubky, secret }: TRestoreLocksSessionParams): LocksSdkSession {
    try {
      return this.buildLocksClient(lockServerPubky).restoreSession(secret);
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksAuthService.restoreSession');
    }
  }

  /** Signs the Locks session out on the Lock Server. */
  static async signout(session: LocksSdkSession): Promise<void> {
    try {
      await session.signout();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksAuthService.signout');
    }
  }

  /**
   * Registers the creator's default Lock Server by writing the lock-service pointer
   * (`/pub/locks.app/config.json`). The Lock Server performs the homeserver write; the SDK session
   * carries the frontend-session bearer, so the FE attaches no `Authorization` header by hand.
   */
  static async setLockServiceConfig(session: LocksSdkSession, defaultLockServer: string): Promise<void> {
    try {
      await session.creator.setLockServicePointer(new SetLockServicePointerOptions(defaultLockServer));
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksAuthService.setLockServiceConfig');
    }
  }
}
