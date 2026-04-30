import { Table } from 'dexie';
import { TagStreamTypes } from './tagStream.types';
import { TagStreamModelSchema } from './tagStream.schema';
import { db } from '@/database/franky/franky';
import { BaseStreamModel } from '@/models/shared/stream/stream';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
export class TagStreamModel extends BaseStreamModel<TagStreamTypes, NexusHotTag, TagStreamModelSchema> {
  static table: Table<TagStreamModelSchema> = db.table('tag_streams');

  constructor(stream: TagStreamModelSchema) {
    super(stream);
  }
}
