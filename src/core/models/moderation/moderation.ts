import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { ModerationModelSchema } from '@/models/moderation/moderation.schema';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import { ModerationType } from './moderation.schema';

export class ModerationModel extends RecordModelBase<string, ModerationModelSchema> implements ModerationModelSchema {
  static table: Table<ModerationModelSchema> = db.table('moderation');

  type: ModerationType;
  is_blurred: boolean;
  created_at: number;

  constructor(data: ModerationModelSchema) {
    super(data);
    this.type = data.type;
    this.is_blurred = data.is_blurred;
    this.created_at = data.created_at;
  }
}
