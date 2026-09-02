import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { buildStarterPackStreamId, USER_STREAM_TAG_DELIMITER } from './userStream.helper';

const expectValidationError = (fn: () => unknown) => {
  try {
    fn();
    expect.fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.category).toBe(ErrorCategory.Validation);
    expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
    expect(appError.service).toBe(ErrorService.Local);
  }
};

describe('buildStarterPackStreamId', () => {
  describe('ID construction', () => {
    it('should join ordered tags under the starter_pack source', () => {
      expect(buildStarterPackStreamId(['bitcoin', 'music'])).toBe('starter_pack:all:all:bitcoin,music');
    });

    it('should preserve tag order (reversed lists yield distinct IDs)', () => {
      const forward = buildStarterPackStreamId(['travel', 'music']);
      const reversed = buildStarterPackStreamId(['music', 'travel']);

      expect(forward).toBe('starter_pack:all:all:travel,music');
      expect(reversed).toBe('starter_pack:all:all:music,travel');
      expect(forward).not.toBe(reversed);
    });

    it('should canonicalize labels so casing/whitespace variants map to one ID', () => {
      const fromMixedCase = buildStarterPackStreamId(['Bitcoin ', 'MUSIC']);
      const fromCanonical = buildStarterPackStreamId(['bitcoin', 'music']);

      expect(fromMixedCase).toBe(fromCanonical);
      expect(fromMixedCase).toBe('starter_pack:all:all:bitcoin,music');
    });

    it('should deduplicate canonical labels while preserving first-seen order', () => {
      expect(buildStarterPackStreamId(['Bitcoin ', 'music', 'bitcoin', 'MUSIC', 'art'])).toBe(
        'starter_pack:all:all:bitcoin,music,art',
      );
    });

    it('should enforce the tag cap after canonical duplicates are removed', () => {
      expect(buildStarterPackStreamId(['a', 'A', 'b', 'B', 'c', 'C'])).toBe('starter_pack:all:all:a,b,c');
    });

    it('should accept the maximum of 5 tags', () => {
      expect(buildStarterPackStreamId(['a', 'b', 'c', 'd', 'e'])).toBe('starter_pack:all:all:a,b,c,d,e');
    });

    it('should accept a single tag', () => {
      expect(buildStarterPackStreamId(['bitcoin'])).toBe('starter_pack:all:all:bitcoin');
    });
  });

  describe('validation', () => {
    it('should reject an empty tag list', () => {
      expectValidationError(() => buildStarterPackStreamId([]));
    });

    it('should reject more than 5 tags', () => {
      expectValidationError(() => buildStarterPackStreamId(['a', 'b', 'c', 'd', 'e', 'f']));
    });

    it('should reject empty and whitespace-only labels', () => {
      expectValidationError(() => buildStarterPackStreamId(['']));
      expectValidationError(() => buildStarterPackStreamId(['   ']));
    });

    it('should reject labels with inner whitespace (banned characters)', () => {
      expectValidationError(() => buildStarterPackStreamId(['rock music']));
      expectValidationError(() => buildStarterPackStreamId(['tab\there']));
      expectValidationError(() => buildStarterPackStreamId(['new\nline']));
    });

    it('should reject labels containing the tag delimiter', () => {
      expectValidationError(() => buildStarterPackStreamId([`bit${USER_STREAM_TAG_DELIMITER}coin`]));
    });

    it('should reject labels containing the stream ID delimiter', () => {
      expectValidationError(() => buildStarterPackStreamId(['bit:coin']));
    });

    it('should reject overlength labels (>20 chars)', () => {
      expectValidationError(() => buildStarterPackStreamId(['a'.repeat(21)]));
    });

    it('should accept a label at exactly 20 chars', () => {
      expect(buildStarterPackStreamId(['a'.repeat(20)])).toBe(`starter_pack:all:all:${'a'.repeat(20)}`);
    });
  });
});
