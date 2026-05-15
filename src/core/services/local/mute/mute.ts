import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import type { TMuteParams } from '@/controllers/mute/mute.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';

type MuteAction = 'mute' | 'unmute';

export class LocalMuteService {
  /**
   * Creates a mute relationship between users
   */
  static async create({ muter, mutee }: TMuteParams): Promise<void> {
    return LocalMuteService.updateMuteStatus({ muter, mutee }, 'mute');
  }

  /**
   * Removes a mute relationship between users
   */
  static async delete({ muter, mutee }: TMuteParams): Promise<void> {
    return LocalMuteService.updateMuteStatus({ muter, mutee }, 'unmute');
  }

  /**
   * Updates the mute status using the muted stream as source of truth
   * @private
   */
  private static async updateMuteStatus({ muter, mutee }: TMuteParams, action: MuteAction): Promise<void> {
    const isMuting = action === 'mute';

    try {
      let statusChanged = false;

      await db.transaction('rw', [UserStreamModel.table], async () => {
        // Check current muted stream for idempotency (read + write atomic to avoid race when two mute/unmute run at once)
        const mutedStream = await LocalStreamUsersService.findById(UserStreamTypes.MUTED);
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
        postStreamQueue.clear();
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
  private static async updateUserStreams(mutee: Pubky, isMuting: boolean): Promise<void> {
    const streamOp = isMuting ? LocalStreamUsersService.prependToStream : LocalStreamUsersService.removeFromStream;

    await streamOp.call(LocalStreamUsersService, UserStreamTypes.MUTED, [mutee]);
  }
}
