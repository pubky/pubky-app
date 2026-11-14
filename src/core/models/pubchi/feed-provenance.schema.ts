export type PubchiFeedProvenanceRecord = {
  id: string;
  owner: string;
  feedId: string;
  createdAt: number;
};

export const pubchiFeedProvenanceTableSchema = '&id, owner, feedId, createdAt';

export function pubchiFeedProvenanceId(owner: string, feedId: string): string {
  return `${owner}:${feedId}`;
}
