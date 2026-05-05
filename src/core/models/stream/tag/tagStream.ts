import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { BaseStreamModel } from '@/models/shared/stream/stream';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
import { TagStreamModelSchema } from './tagStream.schema';
import { TagStreamTypes } from './tagStream.types';

export class TagStreamModel extends BaseStreamModel<TagStreamTypes, NexusHotTag, TagStreamModelSchema> {
  static table: Table<TagStreamModelSchema> = db.table('tag_streams');

  constructor(stream: TagStreamModelSchema) {
    super(stream);
  }
}
