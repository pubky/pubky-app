import { buildNexusUrl, encodePathSegment } from '@/services/nexus/nexus.utils';

/**
 * Bootstrap API Endpoints
 * All API endpoints related to bootstrap operations
 */

const PREFIX = 'bootstrap';

export const bootstrapApi = {
  get: (pubky: string) => {
    const encodedPubky = encodePathSegment(pubky);
    return buildNexusUrl(`${PREFIX}/${encodedPubky}`);
  },
  ingest: (pubky: string) => buildNexusUrl(`ingest/${encodePathSegment(pubky)}`),
};

export type BootstrapApiEndpoint = keyof typeof bootstrapApi;
