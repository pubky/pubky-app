import { InvalidQueryError, NotFoundQueryError, UnavailableQueryError } from './queries/queries.errors';
import type { Answer, Coverage, MoreHint } from './queries/queries.types';
import type { SocialQueries } from './queries/socialQueries';

/** A request the app would send to the central indexer: its full URL or path, its method and its JSON body. */
export interface NexusRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  /** The body as an object or as its JSON text. */
  body?: unknown;
}

/**
 * An answer, or the central indexer's 404 for a post or user the view does not hold. A 404 is `exact` when the
 * view proves the absence; otherwise `more` names what to load before asking again.
 */
export type NexusResponse =
  | { status: 200; json: unknown; coverage: Coverage; more?: MoreHint[] }
  | { status: 404; json: { error: string }; coverage: Coverage; more?: MoreHint[] };

export interface NexusRouter {
  /** Rejects with `UnavailableQueryError` for what the local index cannot answer, `InvalidQueryError` for a bad parameter. */
  route(request: NexusRequest): Promise<NexusResponse>;
}

function responseOf(answer: () => Answer<unknown>): NexusResponse {
  try {
    const { data, coverage, more } = answer();
    return more === undefined ? { status: 200, json: data, coverage } : { status: 200, json: data, coverage, more };
  } catch (error) {
    if (!(error instanceof NotFoundQueryError)) throw error;
    const coverage: Coverage = error.known ? { kind: 'exact' } : { kind: 'scope', note: 'not loaded yet' };
    const json = { error: error.message };
    return error.more.length === 0
      ? { status: 404, json, coverage }
      : { status: 404, json, coverage, more: error.more };
  }
}

const API_VERSION = 'v1';
const VERSION_SEGMENT = /^v\d+$/;

/** Typed reads of the query string. A repeated parameter is an error, as the central indexer's parser makes it. */
interface QueryReader {
  text(name: string): string | undefined;
  int(name: string): number | undefined;
  number(name: string): number | undefined;
  bool(name: string): boolean | undefined;
  /** A comma-separated list. */
  list(name: string): string[] | undefined;
}

function queryReader(route: string, search: URLSearchParams): QueryReader {
  const text = (name: string): string | undefined => {
    const values = search.getAll(name);
    if (values.length > 1) throw new InvalidQueryError(route, name, 'given more than once');
    return values[0];
  };
  const parsed = <T>(name: string, parse: (value: string) => T | undefined, expected: string): T | undefined => {
    const value = text(name);
    if (value === undefined) return undefined;
    const result = parse(value);
    if (result === undefined) throw new InvalidQueryError(route, name, `must be ${expected}`);
    return result;
  };
  return {
    text,
    int: (name) => parsed(name, (value) => (/^\d+$/.test(value) ? Number(value) : undefined), 'a non-negative integer'),
    number: (name) =>
      parsed(
        name,
        (value) => (value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined),
        'a number',
      ),
    bool: (name) =>
      parsed(name, (value) => (value === 'true' ? true : value === 'false' ? false : undefined), 'true or false'),
    list: (name) => text(name)?.split(','),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Typed reads of a JSON body. */
interface BodyReader {
  strings(name: string): string[];
  text(name: string): string | undefined;
  int(name: string): number | undefined;
}

function bodyReader(route: string, body: unknown): BodyReader {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new InvalidQueryError(route, 'body', 'must be JSON');
    }
  }
  if (!isRecord(parsed)) throw new InvalidQueryError(route, 'body', 'must be a JSON object');
  const fields = parsed;
  return {
    strings: (name) => {
      const value = fields[name];
      if (!Array.isArray(value)) throw new InvalidQueryError(route, name, 'must be a list of strings');
      const items: unknown[] = value;
      return items.map((item) => {
        if (typeof item !== 'string') throw new InvalidQueryError(route, name, 'must be a list of strings');
        return item;
      });
    },
    text: (name) => {
      const value = fields[name];
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') throw new InvalidQueryError(route, name, 'must be a string');
      return value;
    },
    int: (name) => {
      const value = fields[name];
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new InvalidQueryError(route, name, 'must be an integer');
      }
      return value;
    },
  };
}

interface Matched {
  /** The path's `:name` segments. */
  path: Record<string, string>;
  query: QueryReader;
  body: () => BodyReader;
}

interface Route {
  method: NexusRequest['method'];
  /** Relative to the version, with `:name` for a captured segment. */
  path: string;
  answer: (matched: Matched) => Answer<unknown>;
}

function routesOf(queries: SocialQueries): Route[] {
  const tagPage = ({ query }: Matched) => ({
    skip_tags: query.int('skip_tags'),
    limit_tags: query.int('limit_tags'),
    limit_taggers: query.int('limit_taggers'),
  });
  const paging = ({ query }: Matched) => ({ skip: query.int('skip'), limit: query.int('limit') });
  const post = ({ path }: Matched) => ({ author_id: path.author_id, post_id: path.post_id });
  return [
    {
      method: 'GET',
      path: 'stream/posts/keys',
      answer: ({ query }) =>
        queries.postStreamKeys({
          source: query.text('source'),
          observer_id: query.text('observer_id'),
          author_id: query.text('author_id'),
          post_id: query.text('post_id'),
          viewer_id: query.text('viewer_id'),
          sorting: query.text('sorting'),
          order: query.text('order'),
          tags: query.list('tags'),
          kind: query.text('kind'),
          exclude_kinds: query.list('exclude_kinds'),
          locked: query.bool('locked'),
          depth: query.int('depth'),
          domain_tags: query.list('domain_tags'),
          start: query.number('start'),
          end: query.number('end'),
          skip: query.int('skip'),
          limit: query.int('limit'),
        }),
    },
    {
      method: 'POST',
      path: 'stream/posts/by_ids',
      answer: ({ body }) => {
        const read = body();
        return queries.postsByIds({ post_ids: read.strings('post_ids'), viewer_id: read.text('viewer_id') });
      },
    },
    {
      method: 'GET',
      path: 'post/:author_id/:post_id',
      answer: (matched) =>
        queries.postView({
          ...post(matched),
          viewer_id: matched.query.text('viewer_id'),
          limit_tags: matched.query.int('limit_tags'),
          limit_taggers: matched.query.int('limit_taggers'),
        }),
    },
    {
      method: 'GET',
      path: 'post/:author_id/:post_id/details',
      answer: (matched) => queries.postDetails(post(matched)),
    },
    {
      method: 'GET',
      path: 'post/:author_id/:post_id/tags',
      answer: (matched) =>
        queries.postTags({ ...post(matched), ...tagPage(matched), viewer_id: matched.query.text('viewer_id') }),
    },
    {
      method: 'GET',
      path: 'post/:author_id/:post_id/taggers/:label',
      answer: (matched) =>
        queries.postTaggers({
          ...post(matched),
          ...paging(matched),
          label: matched.path.label,
          viewer_id: matched.query.text('viewer_id'),
        }),
    },
    {
      method: 'GET',
      path: 'user/:user_id/details',
      answer: ({ path }) => queries.userDetails({ user_id: path.user_id }),
    },
    {
      method: 'GET',
      path: 'user/:user_id/counts',
      answer: ({ path }) => queries.userCounts({ user_id: path.user_id }),
    },
    {
      method: 'GET',
      path: 'user/:user_id/tags',
      answer: (matched) =>
        queries.userTags({
          ...tagPage(matched),
          user_id: matched.path.user_id,
          viewer_id: matched.query.text('viewer_id'),
          depth: matched.query.int('depth'),
        }),
    },
    {
      method: 'GET',
      path: 'user/:user_id/taggers/:label',
      answer: (matched) =>
        queries.userTaggers({
          ...paging(matched),
          user_id: matched.path.user_id,
          label: matched.path.label,
          viewer_id: matched.query.text('viewer_id'),
          depth: matched.query.int('depth'),
        }),
    },
    {
      method: 'GET',
      path: 'user/:user_id/notifications',
      answer: (matched) =>
        queries.notifications({
          ...paging(matched),
          user_id: matched.path.user_id,
          start: matched.query.number('start'),
          end: matched.query.number('end'),
        }),
    },
    {
      method: 'POST',
      path: 'stream/users/by_ids',
      answer: ({ body }) => {
        const read = body();
        return queries.usersByIds({
          user_ids: read.strings('user_ids'),
          viewer_id: read.text('viewer_id'),
          depth: read.int('depth'),
        });
      },
    },
    {
      method: 'GET',
      path: 'stream/users/ids',
      answer: (matched) =>
        queries.userStreamIds({
          ...paging(matched),
          source: matched.query.text('source'),
          user_id: matched.query.text('user_id'),
          viewer_id: matched.query.text('viewer_id'),
          reach: matched.query.text('reach'),
          timeframe: matched.query.text('timeframe'),
          preview: matched.query.bool('preview'),
        }),
    },
    {
      method: 'GET',
      path: 'search/users/by_name/:prefix',
      answer: (matched) => queries.usersByName({ ...paging(matched), prefix: matched.path.prefix }),
    },
    {
      method: 'GET',
      path: 'search/users/by_id/:prefix',
      answer: (matched) => queries.usersById({ ...paging(matched), prefix: matched.path.prefix }),
    },
    {
      method: 'GET',
      path: 'search/users/by_tags',
      answer: (matched) =>
        queries.usersByTags({
          ...paging(matched),
          tags: matched.query.list('tags'),
          user_id: matched.query.text('user_id'),
          reach: matched.query.text('reach'),
        }),
    },
    {
      method: 'GET',
      path: 'search/tags/by_prefix/:prefix',
      answer: (matched) => queries.tagsByPrefix({ ...paging(matched), prefix: matched.path.prefix }),
    },
    { method: 'GET', path: 'search/posts/by_content', answer: () => queries.postsByContent() },
    {
      method: 'GET',
      path: 'tags/hot',
      answer: (matched) =>
        queries.hotTags({
          ...paging(matched),
          user_id: matched.query.text('user_id'),
          reach: matched.query.text('reach'),
          timeframe: matched.query.text('timeframe'),
          taggers_limit: matched.query.int('taggers_limit'),
        }),
    },
    { method: 'GET', path: 'bootstrap/:user_id', answer: ({ path }) => queries.bootstrap({ user_id: path.user_id }) },
    { method: 'PUT', path: 'ingest/:user_id', answer: ({ path }) => queries.ingest({ user_id: path.user_id }) },
  ];
}

/** The segments after the API version, decoded. */
function routeSegments(url: string): string[] {
  const segments = new URL(url, 'http://local.invalid').pathname.split('/').filter((segment) => segment !== '');
  const at = segments.findIndex((segment) => VERSION_SEGMENT.test(segment));
  if (at === -1) throw new UnavailableQueryError(url, 'no API version in the path');
  if (segments[at] !== API_VERSION) throw new UnavailableQueryError(url, `API version ${segments[at]} is not served`);
  return segments.slice(at + 1).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw new InvalidQueryError(url, 'path', 'has a malformed escape');
    }
  });
}

/** The captured segments when `segments` fit the pattern, `null` otherwise. */
function matchPath(pattern: string, segments: readonly string[]): Record<string, string> | null {
  const parts = pattern.split('/');
  if (parts.length !== segments.length) return null;
  const captured: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].startsWith(':')) captured[parts[i].slice(1)] = segments[i];
    else if (parts[i] !== segments[i]) return null;
  }
  return captured;
}

/** Answers the central indexer's `/v1` routes from the local queries; it parses and dispatches, nothing more. */
export function createNexusRouter(queries: SocialQueries): NexusRouter {
  const routes = routesOf(queries);
  return {
    route: async ({ url, method, body }) => {
      const segments = routeSegments(url);
      const search = new URL(url, 'http://local.invalid').searchParams;
      for (const route of routes) {
        if (route.method !== method) continue;
        const path = matchPath(route.path, segments);
        if (path === null) continue;
        return responseOf(() =>
          route.answer({ path, query: queryReader(route.path, search), body: () => bodyReader(route.path, body) }),
        );
      }
      throw new UnavailableQueryError(`${method} ${segments.join('/')}`, 'no such route is served locally');
    },
  };
}
