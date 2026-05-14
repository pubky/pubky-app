import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
import { TagStreamModel } from './tagStream';
import { createDefaultTagStream } from './tagStream.helper';
import { TagStreamTypes } from './tagStream.types';

describe('TagStreamModel', () => {
  // Mock NexusHotTag objects for testing
  const mockTag1: NexusHotTag = {
    label: 'tag1',
    taggers_id: ['user1', 'user2', 'user3'],
    tagged_count: 5,
    taggers_count: 3,
  };

  const mockTag2: NexusHotTag = {
    label: 'tag2',
    taggers_id: ['user2', 'user4', 'user5', 'user6'],
    tagged_count: 8,
    taggers_count: 4,
  };

  beforeEach(async () => {
    await db.initialize();
  });

  describe('constructor', () => {
    it('should create a tag stream with all properties', async () => {
      const { id, stream } = await TagStreamModel.upsert(TagStreamTypes.TODAY_ALL, [mockTag1, mockTag2]);

      expect(id).toBe(TagStreamTypes.TODAY_ALL);
      expect(stream).toEqual([mockTag1, mockTag2]);
    });

    it('should handle empty tags array', () => {
      const streamData = createDefaultTagStream(TagStreamTypes.TODAY_ALL, []);
      const stream = new TagStreamModel(streamData);

      expect(stream.stream).toEqual([]);
    });
  });

  describe('static methods', () => {
    describe('findById', () => {
      it('should find existing tag stream', async () => {
        await TagStreamModel.upsert(TagStreamTypes.TODAY_ALL, [mockTag1, mockTag2]);

        const foundStream = await TagStreamModel.findById(TagStreamTypes.TODAY_ALL);

        expect(foundStream).toBeTruthy();
        expect(foundStream!.id).toBe(TagStreamTypes.TODAY_ALL);
        expect(foundStream!.stream).toEqual([mockTag1, mockTag2]);
      });

      it('should return null for non-existent stream', async () => {
        const foundStream = await TagStreamModel.findById('non-existent' as TagStreamTypes);

        expect(foundStream).toBeNull();
      });
    });

    describe('deleteById', () => {
      it('should delete tag stream by id', async () => {
        await TagStreamModel.upsert(TagStreamTypes.TODAY_ALL, [mockTag1]);

        await TagStreamModel.deleteById(TagStreamTypes.TODAY_ALL);

        const foundStream = await TagStreamModel.findById(TagStreamTypes.TODAY_ALL);
        expect(foundStream).toBeNull();
      });
    });
  });
});
