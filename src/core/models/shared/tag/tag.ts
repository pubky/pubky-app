import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
export class TagModel implements NexusTag {
  label: string;
  taggers: Pubky[];
  taggers_count: number;
  relationship: boolean;

  constructor(tag: NexusTag) {
    this.label = tag.label;
    this.taggers = tag.taggers;
    this.taggers_count = tag.taggers_count;
    this.relationship = tag.relationship;
  }

  setRelationship(relationship: boolean) {
    this.relationship = relationship;
  }

  addTagger(taggerId: Pubky): void {
    if (this.taggers.includes(taggerId)) return; // idempotent
    this.taggers.push(taggerId);
    // Increment count instead of using array length (array may be truncated from Nexus)
    this.taggers_count += 1;
  }

  removeTagger(taggerId: Pubky): void {
    const wasInArray = this.taggers.includes(taggerId);
    this.taggers = this.taggers.filter((id) => id !== taggerId);
    // Decrement count instead of using array length (array may be truncated from Nexus)
    // Only decrement if taggers_count > 0 to avoid negative counts
    if (this.taggers_count > 0) {
      this.taggers_count -= 1;
    }
    // If tagger wasn't in the truncated array but we're removing them,
    // we still decremented the count which is correct
    if (!wasInArray) return; // idempotent for array operations
  }
}
