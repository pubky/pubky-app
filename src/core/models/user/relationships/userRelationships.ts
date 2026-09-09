import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { TupleModelBase } from '@/models/shared/base/tuple/baseTuple';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { NexusUserRelationship } from '@/services/nexus/nexus.types';

export class UserRelationshipsModel
  extends TupleModelBase<Pubky, UserRelationshipsModelSchema>
  implements UserRelationshipsModelSchema
{
  static table: Table<UserRelationshipsModelSchema> = db.table('user_relationships');

  following: boolean;
  followed_by: boolean;

  constructor(userRelationships: UserRelationshipsModelSchema) {
    super(userRelationships);
    this.following = userRelationships.following;
    this.followed_by = userRelationships.followed_by;
  }

  // Adapter function to convert NexusUserRelationship to UserRelationshipsModelSchema
  static toSchema(data: NexusModelTuple<NexusUserRelationship>): UserRelationshipsModelSchema {
    return { id: data[0], ...data[1] };
  }
}
