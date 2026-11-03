import type { OwnerBindingV1 } from '@/libs/pubchi/schemas/tenant';

export type PubchiBindingRecord = OwnerBindingV1 & {
  id: string;
};

export const pubchiBindingTableSchema = '&id, owner, bot, status, updated_at';

export function bindingRecordId(owner: string, bot: string): string {
  return `${owner}:${bot}`;
}
