const X_LINK_LABEL_MATCH = 'TWITTER';
const X_HANDLE_PATTERN = /^@?([A-Za-z0-9_]{1,15})$/;

/** True for the profile link slot that holds an X/Twitter account. */
export function isXProfileLinkLabel(label: string): boolean {
  return label.toUpperCase().includes(X_LINK_LABEL_MATCH);
}

/**
 * Normalizes a profile link before it is validated or saved.
 *
 * The X field's placeholder reads `@user`, so a bare handle is a fair thing to type. The field
 * validates as a URL, so a handle is rewritten to the profile URL we store instead of being
 * rejected. Anything else (other labels, real URLs, empty values) is returned trimmed and unchanged
 * (issue #1846).
 */
export function normalizeProfileLinkUrl(label: string, url: string): string {
  const trimmed = url.trim();

  if (!isXProfileLinkLabel(label) || trimmed.length === 0) {
    return trimmed;
  }

  const handle = X_HANDLE_PATTERN.exec(trimmed);
  return handle ? `https://x.com/${handle[1]}` : trimmed;
}
