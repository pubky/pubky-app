/**
 * Pubky capability coverage for the Pubchi homeserver directory.
 *
 * Grammar from `@synonymdev/pubky` (`CapabilityEntry` = `${CapabilityScope}:${CapabilityAction}`):
 * each entry is `"<scope>:<actions>"` where `scope` starts with `/` and `actions` is
 * `r`, `w`, or `rw` (`wr` is normalized to `rw`). SessionInfo lists those entries.
 *
 * Write on `/pub/app.pubchi/v1/` is granted by a capability whose actions include `w`
 * and whose directory scope (`…/` ) is `/`, `/pub/`, `/pub/app.pubchi/v1/`, or any
 * other directory prefix of that path at a slash boundary. Read-only (`:r`) never
 * satisfies a write. File scopes (no trailing `/`) do not cover the directory.
 */

export const PUBCHI_HOMESERVER_DIRECTORY = '/pub/app.pubchi/v1/';
export const PUBCHI_PRIVATE_DIRECTORY = '/priv/app.pubchi/v1/';

/** Default Ring sign-in request for the App's social and Pubchi-owned state. */
export const APP_SIGNIN_CAPABILITIES = '/pub/pubky.app/:rw,/pub/app.pubchi/v1/:rw,/priv/app.pubchi/v1/:rw';

export const PUBCHI_DEGRADED_SESSION_MESSAGE =
  "Your sign-in predates Pubchi and can't reach its folders yet. Tap Re-approve and confirm in Pubky Ring.";

const ACTIONS = new Set(['r', 'w', 'rw', 'wr']);

type ParsedCapability = {
  scope: string;
  writes: boolean;
};

export function capabilitiesCoverPubchiWrite(capabilities: readonly string[]): boolean {
  return sessionCovers(capabilities, PUBCHI_HOMESERVER_DIRECTORY);
}

export function sessionCovers(capabilities: readonly string[], path: string): boolean {
  const directory = path.endsWith('/') ? path : `${path}/`;
  return capabilities.some((entry) => {
    const parsed = parseCapability(entry);
    return Boolean(parsed?.writes && directoryScopeCovers(parsed.scope, directory));
  });
}

export function capabilityCoversPubchiWrite(entry: string): boolean {
  const parsed = parseCapability(entry);
  if (!parsed?.writes) return false;
  return directoryScopeCovers(parsed.scope, PUBCHI_HOMESERVER_DIRECTORY);
}

function parseCapability(entry: string): ParsedCapability | undefined {
  const separator = entry.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const scope = entry.slice(0, separator);
  const action = entry.slice(separator + 1);
  if (!scope.startsWith('/') || !ACTIONS.has(action)) return undefined;
  return { scope, writes: action.includes('w') };
}

function directoryScopeCovers(scope: string, directory: string): boolean {
  if (!scope.endsWith('/')) return false;
  return directory === scope || directory.startsWith(scope);
}
