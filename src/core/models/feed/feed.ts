import { Table } from 'dexie';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';

export class FeedModel extends RecordModelBase<string, FeedModelSchema> implements FeedModelSchema {
  static table: Table<FeedModelSchema, string> = db.table('feeds');

  name: string;
  icon?: string;
  tags: string[];
  domain_tags: string[];
  reach: PubkyAppFeedReach;
  sort: PubkyAppFeedSort;
  content: PubkyAppPostKind | null;
  layout: PubkyAppFeedLayout;
  created_at: number;
  updated_at: number;

  constructor(feed: FeedModelSchema) {
    super(feed);
    this.name = feed.name;
    this.icon = feed.icon;
    this.tags = feed.tags;
    this.domain_tags = feed.domain_tags;
    this.reach = feed.reach;
    this.sort = feed.sort;
    this.content = feed.content;
    this.layout = feed.layout;
    this.created_at = feed.created_at;
    this.updated_at = feed.updated_at;
  }

  /**
   * Find a feed by ID or throw RECORD_NOT_FOUND if it doesn't exist.
   * Use this when the record MUST exist (e.g., read operations).
   */
  static async findByIdOrThrow(id: string): Promise<FeedModelSchema> {
    const record = await this.findById(id);
    if (!record) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Feed not found', {
        service: ErrorService.Local,
        operation: 'findByIdOrThrow',
        context: { table: this.table.name, id },
      });
    }
    return record;
  }

  static async findAllSorted(): Promise<FeedModelSchema[]> {
    try {
      return await this.table.orderBy('created_at').reverse().toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read sorted records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAllSorted',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
