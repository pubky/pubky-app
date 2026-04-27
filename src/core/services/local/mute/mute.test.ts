import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Core from '@/core';
import { Logger } from '@/libs/logger/logger';

const muter = 'pubky_muter' as Core.Pubky;
const mutee = 'pubky_mutee' as Core.Pubky;

async function clearTables() {
  await Core.db.transaction('rw', [Core.UserStreamModel.table], async () => {
    await Core.UserStreamModel.table.clear();
  });
}

const getMutedStreamId = () => Core.UserStreamTypes.MUTED;

async function isMutedInStream(userId: Core.Pubky): Promise<boolean> {
  // @ts-expect-error - BaseStreamModel generic type constraint
  const stream = await Core.UserStreamModel.findById(getMutedStreamId());
  return stream?.stream.includes(userId) ?? false;
}

describe('LocalMuteService', () => {
  beforeEach(async () => {
    await Core.db.initialize();
    await clearTables();
  });

  describe.each([
    ['create', 'mute', true],
    ['delete', 'unmute', false],
  ])('%s operation', (operation, action, expectedStatus) => {
    const service = Core.LocalMuteService[
      operation as keyof typeof Core.LocalMuteService
    ] as typeof Core.LocalMuteService.create;

    it(`should ${action} when stream does not exist`, async () => {
      await service({ muter, mutee });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
    });

    it(`should be idempotent when user already ${action}d`, async () => {
      // Set up stream to match expected state by performing the action once first
      if (expectedStatus) {
        // For mute idempotency: user is already in stream
        await Core.LocalStreamUsersService.prependToStream(Core.UserStreamTypes.MUTED, [mutee]);
      } else {
        // For unmute idempotency: mute then unmute, so user has been properly unmuted
        await Core.LocalMuteService.create({ muter, mutee });
        await Core.LocalMuteService.delete({ muter, mutee });
      }

      const prependSpy = vi.spyOn(Core.LocalStreamUsersService, 'prependToStream');
      const removeSpy = vi.spyOn(Core.LocalStreamUsersService, 'removeFromStream');

      await service({ muter, mutee });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expect(prependSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      prependSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('should handle double operations without issues', async () => {
      await service({ muter, mutee });
      await service({ muter, mutee });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
    });
  });

  describe('Logging', () => {
    it('should log success messages correctly', async () => {
      const debugSpy = vi.spyOn(Logger, 'debug');

      await Core.LocalMuteService.create({ muter, mutee });
      expect(debugSpy).toHaveBeenCalledWith('Mute created successfully', { muter, mutee });

      await Core.LocalMuteService.delete({ muter, mutee });
      expect(debugSpy).toHaveBeenCalledWith('Unmute completed successfully', { muter, mutee });

      debugSpy.mockRestore();
    });
  });

  describe('Error Types', () => {
    it('should throw WRITE_FAILED for create operations', async () => {
      const spy = vi.spyOn(Core.LocalStreamUsersService, 'prependToStream').mockRejectedValueOnce(new Error('fail'));

      try {
        await Core.LocalMuteService.create({ muter, mutee });
        expect.unreachable('should throw');
      } catch (err: unknown) {
        const e = err as { code?: string };
        expect(e.code).toBe('WRITE_FAILED');
      }

      spy.mockRestore();
    });

    it('should throw DELETE_FAILED for delete operations', async () => {
      // First mute so unmute has something to do
      await Core.LocalMuteService.create({ muter, mutee });

      const spy = vi.spyOn(Core.LocalStreamUsersService, 'removeFromStream').mockRejectedValueOnce(new Error('fail'));

      try {
        await Core.LocalMuteService.delete({ muter, mutee });
        expect.unreachable('should throw');
      } catch (err: unknown) {
        const e = err as { code?: string };
        expect(e.code).toBe('DELETE_FAILED');
      }

      spy.mockRestore();
    });
  });

  // Note: TypeScript TS2684 errors are suppressed because BaseStreamModel generic types
  // have complex this-context requirements that don't affect runtime behavior
  describe('Stream Updates', () => {
    it('should add mutee to muted stream on mute', async () => {
      await Core.LocalMuteService.create({ muter, mutee });

      // @ts-expect-error - BaseStreamModel generic type constraint
      const mutedStream = await Core.UserStreamModel.findById(getMutedStreamId());
      expect(mutedStream?.stream).toContain(mutee);
    });

    it('should remove mutee from muted stream on unmute', async () => {
      // First mute
      await Core.LocalMuteService.create({ muter, mutee });
      // @ts-expect-error - BaseStreamModel generic type constraint
      expect((await Core.UserStreamModel.findById(getMutedStreamId()))?.stream).toContain(mutee);

      // Then unmute
      await Core.LocalMuteService.delete({ muter, mutee });

      // @ts-expect-error - BaseStreamModel generic type constraint
      const mutedStream = await Core.UserStreamModel.findById(getMutedStreamId());
      expect(mutedStream?.stream).not.toContain(mutee);
    });

    it('should prepend new muted user to beginning of stream', async () => {
      const mutee2 = 'pubky_mutee_2' as Core.Pubky;

      await Core.LocalMuteService.create({ muter, mutee });
      await Core.LocalMuteService.create({ muter, mutee: mutee2 });

      // @ts-expect-error - BaseStreamModel generic type constraint
      const mutedStream = await Core.UserStreamModel.findById(getMutedStreamId());
      expect(mutedStream?.stream).toEqual([mutee2, mutee]);
    });

    it('should not add duplicate users to muted stream', async () => {
      await Core.LocalMuteService.create({ muter, mutee });
      await Core.LocalMuteService.create({ muter, mutee });

      // @ts-expect-error - BaseStreamModel generic type constraint
      const mutedStream = await Core.UserStreamModel.findById(getMutedStreamId());
      expect(mutedStream?.stream.filter((id) => id === mutee)).toHaveLength(1);
    });

    it('should not update streams when mute status does not change', async () => {
      // Already muted via stream
      await Core.LocalStreamUsersService.prependToStream(Core.UserStreamTypes.MUTED, [mutee]);

      const prependSpy = vi.spyOn(Core.LocalStreamUsersService, 'prependToStream');

      await Core.LocalMuteService.create({ muter, mutee });

      expect(prependSpy).not.toHaveBeenCalled();
      prependSpy.mockRestore();
    });

    it('should handle unmute when stream does not exist', async () => {
      // Unmute should not throw even if stream doesn't exist
      await expect(Core.LocalMuteService.delete({ muter, mutee })).resolves.not.toThrow();
    });

    it('should clear post stream queue when mute status changes', async () => {
      const clearSpy = vi.spyOn(Core.postStreamQueue, 'clear');

      // Mute should clear queue
      await Core.LocalMuteService.create({ muter, mutee });
      expect(clearSpy).toHaveBeenCalledTimes(1);

      // Unmute should also clear queue
      await Core.LocalMuteService.delete({ muter, mutee });
      expect(clearSpy).toHaveBeenCalledTimes(2);

      clearSpy.mockRestore();
    });

    it('should not clear post stream queue when mute status does not change', async () => {
      // Already muted via stream
      await Core.LocalStreamUsersService.prependToStream(Core.UserStreamTypes.MUTED, [mutee]);

      const clearSpy = vi.spyOn(Core.postStreamQueue, 'clear');

      // Mute again (no-op since already muted)
      await Core.LocalMuteService.create({ muter, mutee });

      // Queue should not be cleared since status didn't change
      expect(clearSpy).not.toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});
