import { AppError } from '@/libs/error/error';

export interface DatabaseContextType {
  isReady: boolean;
  error: AppError | null;
  retry: () => Promise<void>;
}
