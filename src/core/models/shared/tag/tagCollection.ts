import { Table } from 'dexie';
import { TAG_MUTATION_TTL_MS } from '@/config/tags';
import type { Pubky } from '@/models/models.types';
import { ModelBase } from '@/models/shared/base/baseModel';
import { TagModel } from '@/models/shared/tag/tag';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { findTagMutation, getTagMembership, getTagMutationEntries } from '@/models/shared/tag/tag.utils';

export abstract class TagCollection<Id, Schema extends TagCollectionModelSchema<Id>> extends ModelBase<Id, Schema> {
  // TODO: Consider adding multiEntry index on tag labels and if so, update Schema to use it
  tags: TagModel[];
  cache?: TagCollectionModelSchema<Id>['cache'];
  mutations?: TagCollectionModelSchema<Id>['mutations'];

  constructor(data: Schema) {
    super(data);
    this.tags = data.tags.map((t) => new TagModel(t));
    this.cache = data.cache;
    this.mutations = data.mutations;
  }

  ownsMutation(label: string, viewerId: string, expectedId?: string) {
    return expectedId === undefined || findTagMutation(this, label, viewerId)?.id === expectedId;
  }

  recordMutation(label: string, viewerId: string, relationship: boolean, id: string, synced: boolean) {
    const now = Date.now();
    this.initializeLegacyCursor();
    this.mutations = {
      ...Object.fromEntries(
        getTagMutationEntries(this)
          .filter(
            (entry) =>
              (entry.mutation.expiresAt > now || !entry.mutation.synced) &&
              !(entry.label === label.toLowerCase() && entry.mutation.viewerId === viewerId),
          )
          .map(({ key, mutation }) => [key, mutation]),
      ),
      [`${viewerId}:${label.toLowerCase()}`]: {
        id,
        label,
        viewerId,
        relationship,
        synced,
        expiresAt: now + TAG_MUTATION_TTL_MS,
      },
    };
    this.cache!.revision += 1;
  }

  private viewerRelationship(label: string, viewerId: string): boolean {
    const mutation = findTagMutation(this, label, viewerId);
    if (mutation && mutation.expiresAt > Date.now()) return mutation.relationship;
    const tag = this.findByLabel(label);
    if (!tag) return false;
    // Legacy rows predate viewer metadata; preserve their original relationship.
    if (this.cache?.viewerId === undefined) return tag.relationship;
    return getTagMembership(tag, viewerId, this.cache.viewerId) ?? false;
  }

  private initializeLegacyCursor() {
    this.cache ??= { cursor: this.tags.length, exhausted: false, fetchedAt: 0, revision: 0 };
  }

  // -------- Instance helpers (shared) --------

  findByLabel(label: string): TagModel | null {
    const found = this.tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
    return found ?? null;
  }

  deleteTagIfNoTaggers(): boolean {
    const tagsLength = this.tags.length;
    this.tags = this.tags.filter((tag) => tag.taggers_count > 0);
    return tagsLength > this.tags.length; // true if the tag was deleted
  }

  addTagger(label: string, taggerId: Pubky): boolean | null {
    this.initializeLegacyCursor();
    let tagExists = true;
    let labelTagData = this.findByLabel(label);
    // The label does not exist, create it
    if (!labelTagData) {
      labelTagData = new TagModel({ label, taggers: [], taggers_count: 0, relationship: false });
      this.tags.push(labelTagData);
      tagExists = false;
    }
    // The label exist and the active user put a tag already
    else if (this.viewerRelationship(label, taggerId)) {
      return null;
    }
    labelTagData.addTagger(taggerId);
    if (this.cache?.viewerId === undefined || this.cache.viewerId === taggerId) labelTagData.setRelationship(true);
    return tagExists;
  }

  removeTagger(label: string, taggerId: Pubky): boolean | null {
    this.initializeLegacyCursor();
    const labelTagData = this.findByLabel(label);
    if (!labelTagData || !this.viewerRelationship(label, taggerId)) {
      return null;
    }

    labelTagData.removeTagger(taggerId);
    if (this.cache?.viewerId === undefined || this.cache.viewerId === taggerId) labelTagData.setRelationship(false);
    //If there is not taggers, remove the tag
    return this.deleteTagIfNoTaggers();
  }

  /**
   * Retrieves or creates a TagCollection model instance for a given ID.
   *
   * @param id - Unique identifier
   * @returns TagCollection model instance with existing or empty tags
   * @private
   */
  static async getOrCreate<TId, TSchema extends TagCollectionModelSchema<TId>>(
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
    return new this({
      id,
      tags: [],
      cache: { cursor: 0, exhausted: false, fetchedAt: 0, revision: 0, initialized: false },
    } as unknown as TSchema);
  }
}
