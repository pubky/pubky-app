import { validateCapabilities } from '@synonymdev/pubky';

function parseCapabilities(entries: readonly string[]) {
  const normalized = validateCapabilities(entries.join(','));
  return normalized
    ? normalized.split(',').map((entry) => {
        const [scope, actions] = entry.split(':');
        return { scope, actions };
      })
    : [];
}

/**
 * Check effective permissions independently of the session's authentication type.
 * SDK validation preserves canonical path semantics: a trailing slash covers a
 * subtree; a file scope covers only that exact path. Each action may be supplied
 * by a different covering capability. Malformed input never grants access.
 *
 * Matches pubky-common v0.11.0 capabilities.rs `scope_covers_path` and the
 * homeserver's per-action authorization checks. This is a UI preflight only;
 * the homeserver remains responsible for enforcing authorization.
 */
export function hasCapabilities(granted: readonly string[], required: readonly string[]): boolean {
  try {
    const available = parseCapabilities(granted);
    return parseCapabilities(required).every(({ scope, actions }) =>
      [...actions].every((action) =>
        available.some(
          (capability) =>
            capability.actions.includes(action) &&
            (capability.scope === scope || (capability.scope.endsWith('/') && scope.startsWith(capability.scope))),
        ),
      ),
    );
  } catch {
    return false;
  }
}
