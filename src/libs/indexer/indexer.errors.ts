// The library imports no app code, so it carries its own error classes; callers branch on `instanceof`.

export class IndexerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IndexerError';
  }
}

/** Malformed or contradictory input: a bad cursor, an invalid run, runs of different scopes. */
export class InvalidIndexInputError extends IndexerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidIndexInputError';
  }
}

export class HomeserverUnreachableError extends IndexerError {
  readonly homeserver: string;

  constructor(homeserver: string, options?: ErrorOptions) {
    super(`homeserver ${homeserver} is unreachable`, options);
    this.name = 'HomeserverUnreachableError';
    this.homeserver = homeserver;
  }
}

export class RateLimitedError extends IndexerError {
  readonly homeserver: string;
  /** How long the homeserver asked us to wait, when it said. */
  readonly retryAfterMs?: number;

  constructor(homeserver: string, retryAfterMs?: number, options?: ErrorOptions) {
    super(`homeserver ${homeserver} rate limited the request`, options);
    this.name = 'RateLimitedError';
    this.homeserver = homeserver;
    this.retryAfterMs = retryAfterMs;
  }
}

/** A transport call did not settle within its deadline; its signal was aborted. */
export class RequestTimeoutError extends IndexerError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`request did not settle within ${timeoutMs} ms`, options);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** The caller's `AbortSignal` fired. Everything committed before it stays valid. */
export class IndexerAbortedError extends IndexerError {
  constructor(options?: ErrorOptions) {
    super('indexer operation aborted', options);
    this.name = 'IndexerAbortedError';
  }
}

/** A call that needs a running indexer, made before `start` or after `stop`. */
export class IndexerNotStartedError extends IndexerError {
  constructor(options?: ErrorOptions) {
    super('the indexer is not started', options);
    this.name = 'IndexerNotStartedError';
  }
}
