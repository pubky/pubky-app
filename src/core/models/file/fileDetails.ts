import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { FileDetailsModelSchema } from '@/models/file/fileDetails.schema';
import type { Pubky } from '@/models/models.types';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';

export class FileDetailsModel extends RecordModelBase<Pubky, FileDetailsModelSchema> implements FileDetailsModelSchema {
  static table: Table<FileDetailsModelSchema> = db.table('file_details');

  id: string;
  name: string;
  src: string;
  content_type: string;
  size: number;
  created_at: number;
  indexed_at: number;
  metadata: Record<string, string>;
  owner_id: string;
  uri: string;
  urls: {
    feed: string;
    main: string;
    small: string;
  };
  upload_claims?: string[];

  constructor(fileDetails: FileDetailsModelSchema) {
    super(fileDetails);
    this.id = fileDetails.id;
    this.name = fileDetails.name;
    this.src = fileDetails.src;
    this.content_type = fileDetails.content_type;
    this.size = fileDetails.size;
    this.created_at = fileDetails.created_at;
    this.indexed_at = fileDetails.indexed_at;
    this.metadata = fileDetails.metadata;
    this.owner_id = fileDetails.owner_id;
    this.uri = fileDetails.uri;
    this.urls = fileDetails.urls;
    this.upload_claims = fileDetails.upload_claims;
  }

  /**
   * Writes `file`, replacing the row of its id but keeping the upload claims it holds, plus `claim`
   * when given, in one read-write transaction: another upload's claim survives the write, from
   * another tab too (every tab shares the one database).
   */
  static async upsertWithClaim(file: FileDetailsModelSchema, claim?: string) {
    try {
      await db.transaction('rw', this.table, async () => {
        const claims = (await this.table.get(file.id))?.upload_claims ?? [];
        const merged = claim === undefined || claims.includes(claim) ? claims : [...claims, claim];
        await this.table.put({ ...file, upload_claims: merged });
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to upsert record in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'upsertWithClaim',
        context: { table: this.table.name, id: file.id },
        cause: error,
      });
    }
  }

  /**
   * Removes `claims` from the row `id` in one read-write transaction, and answers whether another
   * upload still claims it. No row: no claim.
   */
  static async releaseClaims(id: string, claims: string[]): Promise<boolean> {
    try {
      return await db.transaction('rw', this.table, async () => {
        const held = (await this.table.get(id))?.upload_claims ?? [];
        const remaining = held.filter((claim) => !claims.includes(claim));
        if (remaining.length !== held.length) await this.table.update(id, { upload_claims: remaining });
        return remaining.length > 0;
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to release upload claims in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'releaseClaims',
        context: { table: this.table.name, id },
        cause: error,
      });
    }
  }
}
