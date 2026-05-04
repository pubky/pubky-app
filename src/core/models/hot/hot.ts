import { Table } from 'dexie';
import { HotTagsModelSchema } from './hot.schema';
import { db } from '@/database/franky/franky';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
/**
 * Hot Tags Model
 * Manages hot/trending tags cache in IndexedDB
 */
export class HotTagsModel extends RecordModelBase<string, HotTagsModelSchema> implements HotTagsModelSchema {
  static table: Table<HotTagsModelSchema> = db.table('hot_tags');

  tags: NexusHotTag[];

  constructor(data: HotTagsModelSchema) {
    super(data);
    this.tags = data.tags;
  }
}
