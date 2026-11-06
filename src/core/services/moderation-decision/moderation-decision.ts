import { getModerationDecisionsUrl } from '@/config/moderation';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { moderationDecisionSchema, type TModerationDecisionsResult } from './moderation-decision.types';

export const DECISIONS_PATH = '/v1/decisions';

const AUDIENCE = 'pubky-moderation';
const TIMEOUT_MS = 8000;
const UNAVAILABLE: TModerationDecisionsResult = { status: 'unavailable' };

/**
 * Reads the signed-in user's statements of reasons from the moderation service. The service answers only to a
 * custom proof of possession from the user's grant session, so it names the user without the app ever holding
 * their key (a Pubky Ring sign-in never gives it one).
 *
 * Statements are optional: every way the read can fail (no service configured, no grant session, an outage, a
 * rejected proof, an odd body) is the plain value `unavailable`. Unexpected failures are logged, not reported.
 */
export class ModerationDecisionService {
  private constructor() {}

  static async fetchDecisions(): Promise<TModerationDecisionsResult> {
    const origin = getModerationDecisionsUrl();
    if (!origin) return UNAVAILABLE;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const credentials = await HomeserverService.createCustomPop({
        aud: AUDIENCE,
        method: 'GET',
        path: DECISIONS_PATH,
      });
      if (!credentials) return UNAVAILABLE;
      const response = await fetch(`${origin.replace(/\/+$/, '')}${DECISIONS_PATH}`, {
        method: 'GET',
        headers: { Authorization: `Pubky-Pop grant=${credentials.grant}, pop=${credentials.pop}` },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: abort.signal,
      });
      if (!response.ok) {
        Logger.warn('[ModerationDecisionService:fetchDecisions] unexpected status', { status: response.status });
        return UNAVAILABLE;
      }
      const body: unknown = await response.json().catch(() => null);
      if (typeof body !== 'object' || body === null || !('decisions' in body) || !Array.isArray(body.decisions)) {
        return UNAVAILABLE;
      }
      return {
        status: 'ready',
        decisions: body.decisions.map((entry: unknown) => {
          const parsed = moderationDecisionSchema.safeParse(entry);
          return parsed.success ? parsed.data : null;
        }),
      };
    } catch (error) {
      Logger.warn('[ModerationDecisionService:fetchDecisions] failed', { error });
      return UNAVAILABLE;
    } finally {
      clearTimeout(timer);
    }
  }
}
