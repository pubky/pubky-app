import {
  AuthFlowKind,
  type Capabilities,
  type GrantAuthFlow,
  type Pubky,
  PublicKey,
  type Session,
  type XCallbackParams,
} from '@synonymdev/pubky';
import { z } from 'zod';
import { getAuthClientId } from '@/config/auth';
import { getDefaultHttpRelay, getDeployEnv, getHomeserver, getTestnet } from '@/config/network';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { isPubkyErrorLike } from './error.utils';
import type { TGenerateAuthUrlResult } from './homeserver.types';
import { createCancelableAuthApproval } from './homeserver.utils';

const PENDING_KEY = 'pubky-app-pending-grant-v1';
// App resume policy, separate from grant expiry and server bearer lifetime.
const RESUME_WINDOW_MS = 3 * 60_000;
const pendingSchema = z.object({
  id: z.string(),
  context: z.string(),
  createdAt: z.number(),
  mode: z.enum(['local', 'delegated']),
  saved: z.string(),
});

export interface GrantFlowRequest {
  purpose: 'signin' | 'signup' | 'upgrade';
  capabilities: Capabilities;
  generation: string;
  expectedPubky?: string;
  inviteCode?: string;
  fresh?: boolean;
  xCallback?: XCallbackParams;
}

export class GrantFlowService {
  private static version = 0;
  private static read() {
    try {
      return pendingSchema.parse(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null'));
    } catch {
      return null;
    }
  }

  static clear(id?: string): void {
    if (!id) this.version++;
    if (!id || this.read()?.id === id) sessionStorage.removeItem(PENDING_KEY);
  }

  static async start(
    sdk: Pubky,
    request: GrantFlowRequest,
    onCanceledSession?: (session: Session) => Promise<void>,
  ): Promise<TGenerateAuthUrlResult> {
    const version = ++this.version;
    const inviteBytes = new TextEncoder().encode(request.inviteCode ?? '');
    const inviteHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', inviteBytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const context = JSON.stringify({
      purpose: request.purpose,
      xCallback: request.xCallback,
      capabilities: request.capabilities,
      expectedPubky: request.expectedPubky,
      generation: request.generation,
      clientId: getAuthClientId(),
      homeserver: getHomeserver(),
      environment: getDeployEnv(),
      testnet: getTestnet(),
      relay: getDefaultHttpRelay(),
      inviteHash,
    });
    if (version !== this.version) throw createCanceledError();
    const saved = this.read();
    let flow: GrantAuthFlow | undefined;
    let id = saved?.id ?? '';
    if (
      !request.fresh &&
      saved &&
      saved.context === context &&
      Date.now() >= saved.createdAt &&
      Date.now() - saved.createdAt < RESUME_WINDOW_MS
    ) {
      id = saved.id;
      try {
        flow =
          saved.mode === 'delegated'
            ? await sdk.resumeDelegatedGrantAuthFlow(saved.saved)
            : sdk.resumeGrantAuthFlow(saved.saved);
      } catch (error) {
        // Invalid serialization and a proven missing key cannot be resumed; storage failures can.
        const cannotResume =
          isPubkyErrorLike(error) &&
          (error.name === 'InvalidInput' ||
            (error.name === 'ClientStateError' && /^Delegated grant key not found: .+$/.test(error.message)));
        if (!cannotResume) throw error;
        if (version !== this.version) throw createCanceledError();
        this.clear(saved.id);
      }
    }
    if (!flow) {
      sessionStorage.removeItem(PENDING_KEY);
      id = crypto.randomUUID();
      const kind =
        request.purpose === 'signup'
          ? AuthFlowKind.signup(PublicKey.from(getHomeserver()), request.inviteCode)
          : AuthFlowKind.signin();
      flow = await sdk.startGrantAuthFlow(request.capabilities, kind, {
        clientId: getAuthClientId(),
        relay: getDefaultHttpRelay(),
        xCallback: request.xCallback,
      });
      if (version !== this.version) {
        flow.free();
        throw createCanceledError();
      }
      let mode: 'local' | 'delegated';
      let serialized: string;
      try {
        serialized = flow.saveDelegated();
        mode = 'delegated';
      } catch {
        serialized = flow.saveLocal();
        mode = 'local';
      }
      try {
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ id, context, mode, saved: serialized, createdAt: Date.now() }),
        );
      } catch (error) {
        flow.free();
        throw error;
      }
    }
    if (version !== this.version) {
      flow.free();
      throw createCanceledError();
    }
    const approval = createCancelableAuthApproval(flow, { onCanceledSession });
    return {
      authorizationUrl: flow.authorizationUrl,
      awaitApproval: approval.awaitApproval,
      cancelAuthFlow: () => {
        approval.cancel();
        this.clear(id);
      },
      completeAuthFlow: () => this.clear(id),
    };
  }
}
