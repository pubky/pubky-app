export interface GenerateDeeplinkOptions {
  encode?: boolean;
}

export const generatePubkyRingDeeplink = (value: string, options: GenerateDeeplinkOptions = {}): string => {
  const { encode = true } = options;
  const payload = encode ? encodeURIComponent(value) : value;
  return `pubkyring://${payload}`;
};

// Bitkit rejects the link unless `pubky` is its only query parameter, so nothing may be appended to it.
export const generateBitkitContactDeeplink = (pubky: string): string =>
  `bitkit://contact?pubky=${encodeURIComponent(pubky)}`;

/** Bitkit iOS owns its own scheme; preserve the SDK's grant query byte for byte. */
export const toBitkitIosAuthUrl = (url: string): string => {
  const prefix = 'pubkyauth://signin_grant?';
  if (!url.startsWith(prefix)) return url;
  const query = url.slice(prefix.length);
  return query ? `bitkit://pubky-auth/signin?${query}` : url;
};
