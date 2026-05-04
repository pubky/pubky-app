import { Table } from 'dexie';

import { UserConnectionsFields, UserConnectionsModelSchema } from './userConnections.schema';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { TupleModelBase } from '@/models/shared/base/tuple/baseTuple';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
export class UserConnectionsModel
  extends TupleModelBase<Pubky, UserConnectionsModelSchema>
  implements UserConnectionsModelSchema
{
  static table: Table<UserConnectionsModelSchema> = db.table('user_connections');

  following: Pubky[];
  followers: Pubky[];

  constructor(userConnections: UserConnectionsModelSchema) {
    super(userConnections);
    this.following = userConnections.following;
    this.followers = userConnections.followers;
  }

  static toSchema(
    data: NexusModelTuple<Pick<UserConnectionsModelSchema, 'following' | 'followers'>>,
  ): UserConnectionsModelSchema {
    return { id: data[0], ...data[1] } as UserConnectionsModelSchema;
  }

  /**
   * Add a connection to a user's connection list.
   *
   * Adds the `to` user to the specified connection list (`following` or `followers`)
   * of the `from` user. If the connection already exists, it will be ignored (idempotent).
   * If the user has no connections record yet, one will be created automatically.
   *
   * @param from - The user whose connection list to modify
   * @param to - The user to add to the connection list
   * @param key - The type of connection list: `following` or `followers`
   */
  static async createConnection(from: Pubky, to: Pubky, key: UserConnectionsFields): Promise<boolean> {
    try {
      let didChange = false;
      const exists = await this.findById(from);
      // Might be a case, that we did not yet download the user connections, cover that case
      if (!exists) {
        const model = new UserConnectionsModel({ id: from, following: [], followers: [] });
        model[key].push(to);
        await this.create(model);
        didChange = true;
      } else {
        await this.table
          .where('id')
          .equals(from)
          .modify((row) => {
            const list = row[key] ?? [];
            if (!list.includes(to)) {
              list.push(to);
              row[key] = list;
              didChange = true;
            }
          });
      }
      return didChange;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to create connection in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'createConnection',
        context: { table: this.table.name, from, to, key },
        cause: error,
      });
    }
  }

  static async deleteConnection(from: Pubky, to: Pubky, key: UserConnectionsFields): Promise<boolean> {
    try {
      let didChange = false;
      const exists = await this.findById(from);
      if (!exists) return false;
      await this.table
        .where('id')
        .equals(from)
        .modify((row) => {
          const list = row[key] ?? [];
          const next = list.filter((item) => item !== to);
          if (next.length !== list.length) {
            row[key] = next;
            didChange = true;
          }
        });
      return didChange;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, `Failed to delete connection from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'deleteConnection',
        context: { table: this.table.name, from, to, key },
        cause: error,
      });
    }
  }
}
