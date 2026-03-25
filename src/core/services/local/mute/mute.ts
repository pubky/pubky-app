import * as Core from '@/core';
import { DatabaseErrorCode, Err, ErrorService, Logger } from '@/libs';

type MuteAction = 'mute' | 'unmute';

export class LocalMuteService {
  /**
   * Creates a mute relationship between users
   */
  static async create({ muter, mutee }: Core.TMuteParams): Promise<void> {
    return LocalMuteService.updateMuteStatus({ muter, mutee }, 'mute');
  }

  /**
   * Removes a mute relationship between users
   */
  static async delete({ muter, mutee }: Core.TMuteParams): Promise<void> {
    return LocalMuteService.updateMuteStatus({ muter, mutee }, 'unmute');
  }

  /**
   * Updates the mute status using the muted stream as source of truth
   * @private
   */
  private static async updateMuteStatus({ muter, mutee }: Core.TMuteParams, action: MuteAction): Promise<void> {
    const isMuting = action === 'mute';

    try {
      let statusChanged = false;

      await Core.db.transaction('rw', [Core.UserStreamModel.table], async () => {
        // Check current muted stream for idempotency (read + write atomic to avoid race when two mute/unmute run at once)
        const mutedStream = await Core.LocalStreamUsersService.findById(Core.UserStreamTypes.MUTED);
        const isCurrentlyMuted = mutedStream?.stream.includes(mutee) ?? false;

        statusChanged = isMuting !== isCurrentlyMuted;
        if (!statusChanged) {
          Logger.debug(isMuting ? 'Mute created successfully' : 'Unmute completed successfully', { muter, mutee });
          return;
        }

        // Update muted stream (must stay inside transaction for atomicity)
        await this.updateUserStreams(mutee, isMuting);
      });

      if (statusChanged) {
        // Clear post stream queue so next scroll uses updated mute list
        // The queue may contain posts filtered with the old mute state
        Core.postStreamQueue.clear();
      }

      Logger.debug(isMuting ? 'Mute created successfully' : 'Unmute completed successfully', { muter, mutee });
    } catch (error) {
      const operation = isMuting ? 'mute' : 'unmute';
      const errorType = isMuting ? DatabaseErrorCode.WRITE_FAILED : DatabaseErrorCode.DELETE_FAILED;
      throw Err.database(errorType, `Failed to ${operation} mute relationship`, {
        service: ErrorService.Local,
        operation,
        context: { muter, mutee },
        cause: error,
      });
    }
  }

  /**
   * Update user streams after mute/unmute
   *
   * @param mutee - User being muted/unmuted
   * @param isMuting - True for mute, false for unmute
   */
  private static async updateUserStreams(mutee: Core.Pubky, isMuting: boolean): Promise<void> {
    const streamOp = isMuting
      ? Core.LocalStreamUsersService.prependToStream
      : Core.LocalStreamUsersService.removeFromStream;

    await streamOp.call(Core.LocalStreamUsersService, Core.UserStreamTypes.MUTED, [mutee]);
  }
}
