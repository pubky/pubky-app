import { IndexableType, Table, UpdateSpec } from 'dexie';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Shared base class for Dexie-backed models exposing common CRUD/query helpers.
 */
export abstract class ModelBase<Id, Schema extends { id: Id }> {
  id: Id;

  protected constructor(data: Schema) {
    this.id = data.id;
  }

  /**
   * Create a new record (strict insert). Fails if the key already exists.
   */
  static async create<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, data: TSchema): Promise<TId> {
    try {
      return await this.table.add(data);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to create record in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'create',
        context: { table: this.table.name, id: data.id },
        cause: error,
      });
    }
  }

  /**
   * Insert or replace a record (upsert). Replaces the record entirely if it exists.
   */
  static async upsert<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, data: TSchema) {
    try {
      await this.table.put(data);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to upsert record in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'upsert',
        context: { table: this.table.name, id: data.id },
        cause: error,
      });
    }
  }

  /**
   * Partially update a record by id. Returns the number of modified rows (0 if none).
   */
  static async update<TId, TSchema extends { id: TId }>(
    this: { table: Table<TSchema> },
    id: TId,
    changes: UpdateSpec<TSchema>,
  ): Promise<number> {
    try {
      return await this.table.update(id, changes);
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.WRITE_FAILED,
        `Failed to update record in ${this.table.name}: ${String(id)}`,
        {
          service: ErrorService.Local,
          operation: 'update',
          context: { table: this.table.name, id },
          cause: error,
        },
      );
    }
  }

  /**
   * Find a single record by its id and wrap it into a model instance.
   *
   * Returns the concrete model (`TModel`) or `null` when not found. This method
   * materializes a model instance so callers can immediately use instance-level
   * behavior (methods, derived accessors, invariants), not just raw data.
   */
  static async findById<TId, TSchema extends { id: TId }, TModel extends ModelBase<TId, TSchema>>(
    this: { table: Table<TSchema>; new (data: TSchema): TModel },
    id: TId,
  ): Promise<TModel | null> {
    try {
      const record = await this.table.get(id);
      if (!record) {
        return null;
      }
      return new this(record);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to find record in ${this.table.name}: ${String(id)}`, {
        service: ErrorService.Local,
        operation: 'findById',
        context: { table: this.table.name, id },
        cause: error,
      });
    }
  }

  /**
   * Find multiple records by their ids.
   *
   * Returns an array of raw schema objects (`TSchema`). It does not construct
   * model instances for performance reasons when fetching many records.
   */
  static async findByIds<TId, TSchema extends { id: TId }>(
    this: { table: Table<TSchema> },
    ids: TId[],
  ): Promise<TSchema[]> {
    try {
      return await this.table
        .where('id')
        .anyOf(ids as IndexableType[])
        .toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to find records in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findByIds',
        context: { table: this.table.name, count: ids.length },
        cause: error,
      });
    }
  }

  /**
   * Find multiple records by their ids, preserving input order.
   *
   * Returns an array where each element is the raw schema (`TSchema`) or `undefined`
   * if the corresponding id was not found. This method is schema-oriented by
   * design (no model construction) to keep batch lookups lightweight. If you
   * need model instances, compose on top by mapping non-null entries to
   * `new this(row)`.
   */
  static async findByIdsPreserveOrder<TId, TSchema extends { id: TId }>(
    this: { table: Table<TSchema> },
    ids: TId[],
  ): Promise<Array<TSchema | undefined>> {
    try {
      return await this.table.bulkGet(ids as IndexableType[]);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to find records (with nulls) in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findByIdsPreserveOrder',
        context: { table: this.table.name, count: ids.length },
        cause: error,
      });
    }
  }

  /**
   * Check if a record exists by id.
   */
  static async exists<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, id: TId) {
    try {
      return (
        (await this.table
          .where('id')
          .equals(id as IndexableType)
          .count()) > 0
      );
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to check if record exists in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'exists',
        context: { table: this.table.name, id },
        cause: error,
      });
    }
  }

  /**
   * Delete a record by id.
   */
  static async deleteById<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, id: TId): Promise<void> {
    try {
      await this.table.delete(id);
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.DELETE_FAILED,
        `Failed to delete record in ${this.table.name}: ${String(id)}`,
        {
          service: ErrorService.Local,
          operation: 'deleteById',
          context: { table: this.table.name, id },
          cause: error,
        },
      );
    }
  }

  /**
   * Clear all records from the table.
   */
  static async clear<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }): Promise<void> {
    try {
      await this.table.clear();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, `Failed to clear table ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'clear',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
