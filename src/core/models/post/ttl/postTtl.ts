import { Table } from 'dexie';

import { PostTtlModelSchema } from './postTtl.schema';
import { db } from '@/database/franky/franky';
import { Ttl } from '@/models/shared/ttl/ttl';
export class PostTtlModel extends Ttl<string, PostTtlModelSchema> implements PostTtlModelSchema {
  static table: Table<PostTtlModelSchema> = db.table('post_ttl');

  constructor(postTtl: PostTtlModelSchema) {
    super(postTtl);
  }
}
