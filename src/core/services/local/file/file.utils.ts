import type { NexusFileUrls } from '@/services/nexus/nexus.types';
export function buildUrls(fileCompositeId: string): NexusFileUrls {
  const path = fileCompositeId.replaceAll(':', '/');
  return {
    main: `${path}/main`,
    feed: `${path}/feed`,
    small: `${path}/small`,
  };
}
