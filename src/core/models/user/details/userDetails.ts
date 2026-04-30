import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import type { NexusUserLink } from '@/services/nexus/nexus.types';

export class UserDetailsModel extends RecordModelBase<Pubky, UserDetailsModelSchema> implements UserDetailsModelSchema {
  static table: Table<UserDetailsModelSchema> = db.table('user_details');

  name: string;
  bio: string;
  image: string | null;
  indexed_at: number;
  links: NexusUserLink[] | null;
  status: string | null;

  constructor(userDetails: UserDetailsModelSchema) {
    super(userDetails);
    this.name = userDetails.name;
    this.bio = userDetails.bio;
    this.image = userDetails.image;
    this.indexed_at = userDetails.indexed_at;
    this.links = userDetails.links;
    this.status = userDetails.status;
  }
}
