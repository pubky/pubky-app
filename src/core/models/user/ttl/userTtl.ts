import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { Ttl } from '@/models/shared/ttl/ttl';
import { UserTtlModelSchema } from './userTtl.schema';

export class UserTtlModel extends Ttl<Pubky, UserTtlModelSchema> implements UserTtlModelSchema {
  static table: Table<UserTtlModelSchema> = db.table('user_ttl');

  constructor(userTtl: UserTtlModelSchema) {
    super(userTtl);
  }
}
