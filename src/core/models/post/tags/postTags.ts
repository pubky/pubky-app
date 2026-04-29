import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { TagCollection } from '@/models/shared/tag/tagCollection';

export type PostTagsModelSchema = TagCollectionModelSchema<string>;

export class PostTagsModel extends TagCollection<string, PostTagsModelSchema> implements PostTagsModelSchema {
  static table: Table<PostTagsModelSchema> = db.table('post_tags');

  constructor(data: PostTagsModelSchema) {
    super(data);
  }
}
