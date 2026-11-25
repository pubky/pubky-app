import { IndexerError } from '../../indexer.errors';

/** What the local index cannot answer: a query that needs a global index, or a user or post it never saw. */
export class UnavailableQueryError extends IndexerError {
  readonly code = 'indexer.query.unavailable';
  readonly query: string;

  constructor(query: string, reason: string) {
    super(`${query} is unavailable locally: ${reason}`);
    this.name = 'UnavailableQueryError';
    this.query = query;
  }
}

/** A parameter the central indexer would reject with a 400. */
export class InvalidQueryError extends IndexerError {
  readonly code = 'indexer.query.invalid';
  readonly query: string;
  readonly parameter: string;

  constructor(query: string, parameter: string, reason: string) {
    super(`${query}: invalid \`${parameter}\`: ${reason}`);
    this.name = 'InvalidQueryError';
    this.query = query;
    this.parameter = parameter;
  }
}
