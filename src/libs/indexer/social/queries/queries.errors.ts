import { IndexerError } from '../../indexer.errors';
import type { MoreHint } from './queries.types';

/** What the local index cannot answer: a query that needs a global index or a user outside the scope. */
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

/**
 * A post or user the view does not hold. `known` when the view proves the absence: the author's history that
 * would hold it is loaded. Otherwise it may only be unloaded: `retryable`, with `more` naming what to load.
 */
export class NotFoundQueryError extends IndexerError {
  readonly code = 'indexer.query.not_found';
  readonly query: string;
  readonly entity: 'post' | 'user';
  /** `{author}:{postId}` for a post, the user id for a user. */
  readonly key: string;
  readonly known: boolean;
  readonly retryable: boolean;
  readonly more: MoreHint[];

  constructor(query: string, entity: 'post' | 'user', key: string, known: boolean, more: MoreHint[]) {
    super(`${query}: ${entity} ${key} ${known ? 'not found' : 'not loaded'}`);
    this.name = 'NotFoundQueryError';
    this.query = query;
    this.entity = entity;
    this.key = key;
    this.known = known;
    this.retryable = !known;
    this.more = more;
  }
}
