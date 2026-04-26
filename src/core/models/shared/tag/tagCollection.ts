import { Table } from 'dexie';
import * as Core from '@/core';
import { ModelBase } from '@/core/models/shared/base/baseModel';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export abstract class TagCollection<Id, Schema extends Core.TagCollectionModelSchema<Id>> extends ModelBase<
  Id,
  Schema
> {
  // TODO: Consider adding multiEntry index on tag labels and if so, update Schema to use it
  tags: Core.TagModel[];

  constructor(data: Schema) {
    super(data);
    this.tags = data.tags.map((t) => new Core.TagModel(t));
  }

  // -------- Instance helpers (shared) --------

  findByLabel(label: string): Core.TagModel | null {
    const found = this.tags.find((t) => t.label === label);
    return found ?? null;
  }

  deleteTagIfNoTaggers(): boolean {
    const tagsLength = this.tags.length;
    this.tags = this.tags.filter((tag) => tag.taggers_count > 0);
    return tagsLength > this.tags.length; // true if the tag was deleted
  }

  addTagger(label: string, taggerId: Core.Pubky): boolean | null {
    let tagExists = true;
    let labelTagData = this.findByLabel(label);
    // The label does not exist, create it
    if (!labelTagData) {
      labelTagData = new Core.TagModel({ label, taggers: [], taggers_count: 0, relationship: false });
      this.tags.push(labelTagData);
      tagExists = false;
    }
    // The label exist and the active user put a tag already
    else if (labelTagData?.relationship) {
      return null;
    }
    labelTagData.addTagger(taggerId);
    labelTagData.setRelationship(true);
    return tagExists;
  }

  removeTagger(label: string, taggerId: Core.Pubky): boolean | null {
    const labelTagData = this.findByLabel(label);
    if (!labelTagData || !labelTagData?.relationship) {
      return null;
    }

    labelTagData.removeTagger(taggerId);
    labelTagData.setRelationship(false);
    //If there is not taggers, remove the tag
    return this.deleteTagIfNoTaggers();
  }

  // -------- Static CRUD (inherited from ModelBase) --------

  static async bulkSave<TId, TSchema extends Core.TagCollectionModelSchema<TId>>(
    this: { table: Table<TSchema> },
    tuples: Core.NexusModelTuple<Core.NexusTag[]>[],
  ) {
    try {
      const toSave = tuples.map((t) => ({ id: t[0] as TId, tags: t[1] }) as TSchema);
      return await this.table.bulkPut(toSave);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to bulk save tags in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'bulkSave',
        context: { table: this.table.name, count: tuples.length },
        cause: error,
      });
    }
  }

  /**
   * Retrieves or creates a TagCollection model instance for a given ID.
   *
   * @param id - Unique identifier
   * @returns TagCollection model instance with existing or empty tags
   * @private
   */
  static async getOrCreate<TId, TSchema extends Core.TagCollectionModelSchema<TId>>(
    this: {
      table: Table<TSchema>;
      new (data: TSchema): TagCollection<TId, TSchema>;
      findById(id: TId): Promise<TagCollection<TId, TSchema> | null>;
    },
    id: TId,
  ): Promise<TagCollection<TId, TSchema>> {
    const tagsData = await this.findById(id);
    if (tagsData) {
      return tagsData;
    }
    return new this({ id, tags: [] } as unknown as TSchema);
  }
}
