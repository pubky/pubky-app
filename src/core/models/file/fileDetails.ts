import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
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
  }
}
