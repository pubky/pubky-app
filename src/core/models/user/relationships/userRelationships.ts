import { Table } from 'dexie';

import * as Core from '@/core';
import { TupleModelBase } from '@/core/models/shared/base/tuple/baseTuple';

export class UserRelationshipsModel
  extends TupleModelBase<Core.Pubky, Core.UserRelationshipsModelSchema>
  implements Core.UserRelationshipsModelSchema
{
  static table: Table<Core.UserRelationshipsModelSchema> = Core.db.table('user_relationships');

  following: boolean;
  followed_by: boolean;

  constructor(userRelationships: Core.UserRelationshipsModelSchema) {
    super(userRelationships);
    this.following = userRelationships.following;
    this.followed_by = userRelationships.followed_by;
  }

  // Adapter function to convert NexusUserRelationship to UserRelationshipsModelSchema
  static toSchema(data: Core.NexusModelTuple<Core.NexusUserRelationship>): Core.UserRelationshipsModelSchema {
    return { id: data[0], ...data[1] };
  }
}
