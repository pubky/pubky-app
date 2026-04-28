import { Table } from 'dexie';
import { UserStreamModelSchema } from './userStream.schema';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { BaseStreamModel } from '@/models/shared/stream/stream';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
// Using string for ID type to support composite IDs like 'userId:followers'
export class UserStreamModel extends BaseStreamModel<UserStreamId, Pubky, UserStreamModelSchema> {
  static table: Table<UserStreamModelSchema> = db.table('user_streams');

  constructor(stream: UserStreamModelSchema) {
    super(stream);
  }
}
