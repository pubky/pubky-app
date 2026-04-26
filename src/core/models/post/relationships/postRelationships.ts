import { Table } from 'dexie';

import * as Core from '@/core';
import { TupleModelBase } from '@/core/models/shared/base/tuple/baseTuple';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class PostRelationshipsModel
  extends TupleModelBase<string, Core.PostRelationshipsModelSchema>
  implements Core.PostRelationshipsModelSchema
{
  static table: Table<Core.PostRelationshipsModelSchema> = Core.db.table('post_relationships');

  replied: string | null;
  reposted: string | null;
  mentioned: Core.Pubky[];

  constructor(postRelationships: Core.PostRelationshipsModelSchema) {
    super(postRelationships);
    this.replied = postRelationships.replied;
    this.reposted = postRelationships.reposted;
    this.mentioned = postRelationships.mentioned;
  }

  // Adapter function to convert NexusPostRelationships to PostRelationshipsModelSchema
  static toSchema(data: Core.NexusModelTuple<Core.NexusPostRelationships>): Core.PostRelationshipsModelSchema {
    return { ...data[1], id: data[0] };
  }

  // Query methods
  static async getReplies(postId: string): Promise<Core.PostRelationshipsModelSchema[]> {
    try {
      return await this.table.where('replied').equals(postId).toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to get replies', {
        service: ErrorService.Local,
        operation: 'getReplies',
        context: { table: this.table.name, postId },
        cause: error,
      });
    }
  }

  /**
   * Get the parent post ID for a given post ID
   * @param postId - The ID of the post to get the parent post ID for
   * @returns The parent post ID or undefined if not found
   */
  static async getParentPostId(postId: string): Promise<string | null | undefined> {
    try {
      return (await this.table.where('replied').equals(postId).first())?.replied;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to get parent post ID', {
        service: ErrorService.Local,
        operation: 'getParentPostId',
        context: { table: this.table.name, postId },
        cause: error,
      });
    }
  }
}
