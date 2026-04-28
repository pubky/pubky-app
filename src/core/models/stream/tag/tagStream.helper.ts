import { TagStreamModelSchema } from './tagStream.schema';
import { TagStreamTypes } from './tagStream.types';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
export const createDefaultTagStream = (id: TagStreamTypes, stream: NexusHotTag[]): TagStreamModelSchema => {
  return {
    id,
    stream,
  };
};
