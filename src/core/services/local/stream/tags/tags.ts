import { TagStreamModel } from '@/models/stream/tag/tagStream';
import type { TagStreamTypes } from '@/models/stream/tag/tagStream.types';
import type { NexusHotTag } from '@/services/nexus/nexus.types';

export class LocalStreamTagsService {
  private constructor() {}

  static async upsert(streamId: TagStreamTypes, stream: NexusHotTag[]): Promise<void> {
    await TagStreamModel.upsert(streamId, stream);
  }
}
