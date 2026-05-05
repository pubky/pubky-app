import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { Ttl } from '@/models/shared/ttl/ttl';
import { PostTtlModelSchema } from './postTtl.schema';

export class PostTtlModel extends Ttl<string, PostTtlModelSchema> implements PostTtlModelSchema {
  static table: Table<PostTtlModelSchema> = db.table('post_ttl');

  constructor(postTtl: PostTtlModelSchema) {
    super(postTtl);
  }
}
