/**
 * Headers of every image the app serves from its origin on another site's behalf (`/api/favicon`,
 * `/api/image`): the image is served as the type its bytes are, never as script or a document. No
 * sniffing, a sandboxing policy, and same-origin use only.
 */
export const IMAGE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
};
