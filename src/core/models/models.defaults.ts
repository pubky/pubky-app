import type { PaginationParams } from '@/models/models.types';

export const DEFAULT_PAGINATION: PaginationParams = {
  skip: 0,
  limit: 10,
};

export const COMPOSITE_ID_DELIMITER = ':' as const;
