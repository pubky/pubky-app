/** One DNS label: letters, digits and hyphens, 1-63 long, no hyphen at either end. */
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Names that never point at a public site: the icon route never reads from them. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'onion', 'home.arpa', 'lan'];

/**
 * Favicon route input validators.
 *
 * The route takes a host name, never a URL: the address read is built from it on the server
 * (`getFaviconSource`), so a caller cannot choose a path, port, query or scheme.
 */
export class FaviconValidators {
  private constructor() {}

  /**
   * The host as the route reads it (lower case, no trailing dot), or `null` when it is not a
   * public DNS name: empty, longer than 253, a single label, an IP address (numeric last label,
   * any `:` or `[`), a port, a path, or a local-only name (`localhost`, `.local`, `.onion`, ...).
   * Addresses a public name resolves to are checked again when it is read (`checkDnsSafety`).
   */
  static validateHost(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const host = value.toLowerCase().replace(/\.$/, '');
    if (!host || host.length > 253) return null;
    const labels = host.split('.');
    if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
    if (/^\d+$/.test(labels[labels.length - 1])) return null;
    if (LOCAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    return host;
  }
}
