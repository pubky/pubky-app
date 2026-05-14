import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { TagCollection } from '@/models/shared/tag/tagCollection';

export type UserTagsModelSchema = TagCollectionModelSchema<Pubky>;

export class UserTagsModel extends TagCollection<Pubky, UserTagsModelSchema> implements UserTagsModelSchema {
  static table: Table<UserTagsModelSchema> = db.table('user_tags');

  constructor(data: UserTagsModelSchema) {
    super(data);
  }
}
