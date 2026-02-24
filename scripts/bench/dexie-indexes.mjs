/* eslint-disable @typescript-eslint/no-unused-expressions */
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { performance } from 'node:perf_hooks';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

const ROWS = 2000;
const UPDATE_ROWS = 500;
const LOOKUPS = 150;
const ROUNDS = 2;

function normalizeSchema(schema) {
  return schema
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function fmt(n) {
  return `${n.toFixed(2)}ms`;
}

function pct(base, next) {
  if (base === 0) return 'n/a';
  const change = ((next - base) / base) * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}

async function measure(fn, rounds = ROUNDS) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

async function makeDb(name, stores) {
  await Dexie.delete(name);
  const db = new Dexie(name);
  db.version(1).stores(stores);
  await db.open();
  return db;
}

function buildFeedRows(rows) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: i + 1,
      name: `Feed ${i}`,
      tags: [`tag-${i % 15}`],
      reach: 'all',
      sort: 'timeline',
      content: null,
      layout: 'list',
      created_at: now - i * 500,
      updated_at: now - i * 250,
    });
  }
  return out;
}

function buildModerationRows(rows) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: i % 2 === 0 ? `author-${i % 200}:post-${i}` : `pubky-user-${i}`,
      type: i % 2 === 0 ? 'post' : 'profile',
      is_blurred: i % 3 !== 0,
      created_at: now - i * 1000,
    });
  }
  return out;
}

function buildPostCountsRows(rows) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `author-${i % 200}:post-${i}`,
      tags: i % 40,
      unique_tags: i % 25,
      reposts: i % 75,
      replies: i % 120,
    });
  }
  return out;
}

function buildPostTtlRows(rows) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `author-${i % 200}:post-${i}`,
      // Mix fresh and stale entries to emulate TTL checks.
      lastUpdatedAt: i % 3 === 0 ? now - 5 * 60 * 1000 - i : now - (i % 45) * 1000,
    });
  }
  return out;
}

function buildTagCollectionRows(rows) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const tags = [];
    const tagCount = i % 5;
    for (let j = 0; j < tagCount; j++) {
      const taggersCount = (j % 3) + 1;
      tags.push({
        label: `tag-${(i + j) % 120}`,
        taggers: Array.from({ length: taggersCount }, (_, k) => `user-${(i + j + k) % 300}`),
        taggers_count: taggersCount,
        relationship: (i + j) % 2 === 0,
      });
    }
    out.push({
      id: `author-${i % 200}:post-${i}`,
      tags,
    });
  }
  return out;
}

function buildPostStreamRows(rows) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const stream = [];
    const len = 8 + (i % 5);
    for (let j = 0; j < len; j++) {
      if (j === 0) {
        stream.push(`shared-post-${i % 150}`);
      } else {
        stream.push(`author-${(i + j) % 200}:post-${i * 10 + j}`);
      }
    }
    out.push({
      id: `stream-${i}`,
      stream,
    });
  }
  return out;
}

function buildPostRelationshipsRows(rows) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const parent = i % 4 === 0 ? null : `author-${i % 100}:post-${Math.max(0, i - 1)}`;
    out.push({
      id: `author-${i % 200}:post-${i}`,
      replied: parent,
      reposted: i % 7 === 0 ? `author-${(i + 3) % 100}:post-${Math.max(0, i - 2)}` : null,
      mentioned: i % 6 === 0 ? [`user-${i % 100}`, `user-${(i + 1) % 100}`] : [],
    });
  }
  return out;
}

function buildPostRelationshipsWorkloads({ table, rows, config, flags, options = {} }) {
  const { includeRepostedQuery = false, includeMentionedQuery = false } = options;

  const workloads = [
    {
      key: 'bulkInsert',
      label: 'bulkInsert',
      run: async () => {
        await seedTable(table, rows, 'bulkPut');
        await table.clear();
      },
    },
    {
      key: 'bulkUpsertBatch',
      label: 'bulkUpsertBatch',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            ...row,
            replied: i % 5 === 0 ? null : `author-${(i + 7) % 100}:post-${Math.max(0, i - 2)}`,
            reposted: i % 9 === 0 ? null : row.reposted,
            mentioned: i % 8 === 0 ? [`user-${i % 100}`] : row.mentioned,
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'replyQuery',
      label: 'replyQuery (index vs scan)',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const parent = `author-${(i * 11) % 100}:post-${Math.max(0, i * 11 - 1)}`;
          if (flags.repliedIndex) {
            await table.where('replied').equals(parent).toArray();
          } else {
            const matches = await table.filter((row) => row.replied === parent).toArray();
            matches.slice(0, 100);
          }
        }
      },
    },
  ];

  if (includeRepostedQuery) {
    workloads.push({
      key: 'repostedQuery',
      label: 'repostedQuery (index vs scan)',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const groups = Math.max(1, Math.floor(config.rows / 7));
          const n = (((i + 1) * 7) % groups) * 7;
          const target = `author-${(n + 3) % 100}:post-${Math.max(0, n - 2)}`;
          if (flags.repostedIndex) {
            await table.where('reposted').equals(target).toArray();
          } else {
            const matches = await table.filter((row) => row.reposted === target).toArray();
            matches.slice(0, 100);
          }
        }
      },
    });
  }

  if (includeMentionedQuery) {
    workloads.push({
      key: 'mentionedQuery',
      label: 'mentionedQuery (index vs scan)',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const userId = `user-${(i * 5) % 100}`;
          if (flags.mentionedIndex) {
            await table.where('mentioned').equals(userId).toArray();
          } else {
            const matches = await table
              .filter((row) => Array.isArray(row.mentioned) && row.mentioned.includes(userId))
              .toArray();
            matches.slice(0, 100);
          }
        }
      },
    });
  }

  workloads.push(
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 17) % config.rows;
          await table.get(`author-${n % 200}:post-${n}`);
        }
      },
    },
    {
      key: 'readRelationshipsByIds',
      label: 'readRelationshipsByIds (bulkGet)',
      run: async () => {
        const ids = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 7) % config.rows;
          ids.push(`author-${n % 200}:post-${n}`);
        }
        await table.bulkGet(ids);
      },
    },
  );

  return workloads;
}

function buildTagCollectionWorkloads({ table, rows, config }) {
  return [
    {
      key: 'bulkInsert',
      label: 'bulkInsert',
      run: async () => {
        await seedTable(table, rows, 'bulkPut');
        await table.clear();
      },
    },
    {
      key: 'bulkSaveBatch',
      label: 'bulkSaveBatch (bulkPut)',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          const nextTags = row.tags.slice(0, 4).map((tag, idx) => ({
            ...tag,
            taggers_count: tag.taggers_count + 1,
            relationship: idx % 2 === 0 ? !tag.relationship : tag.relationship,
          }));
          if (nextTags.length === 0) {
            nextTags.push({
              label: `tag-new-${i % 50}`,
              taggers: [`user-${i % 300}`],
              taggers_count: 1,
              relationship: true,
            });
          }
          updates.push({ id: row.id, tags: nextTags });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'touchTagCollections',
      label: 'touchTagCollections (put)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          const nextTags = row.tags.concat({
            label: `tag-touch-${i % 80}`,
            taggers: [`user-${(i + 1) % 300}`],
            taggers_count: 1,
            relationship: i % 2 === 0,
          });
          await table.put({ id: row.id, tags: nextTags.slice(-6) });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 17) % config.rows;
          await table.get(`author-${n % 200}:post-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 11) % config.rows;
          ids.push(`author-${n % 200}:post-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
  ];
}

function buildPostStreamWorkloads({ table, rows, config, flags }) {
  return [
    {
      key: 'bulkInsert',
      label: 'bulkInsert',
      run: async () => {
        await seedTable(table, rows, 'bulkPut');
        await table.clear();
      },
    },
    {
      key: 'bulkUpsertStreams',
      label: 'bulkUpsertStreams (bulkPut)',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            id: row.id,
            stream: [`new-head-${i}`, ...row.stream.slice(0, 9)],
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'prependItemsLikeFlow',
      label: 'prependItemsLikeFlow',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const id = `stream-${i}`;
          const items = [`prepend-${i}`, `prepend-shared-${i % 50}`];
          const existing = await table.get(id);
          if (!existing) {
            await table.put({ id, stream: items });
            continue;
          }
          await table
            .where('id')
            .equals(id)
            .modify((row) => {
              const next = items.filter((item) => !row.stream.includes(item));
              if (next.length) row.stream.unshift(...next);
            });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 13) % config.rows;
          await table.get(`stream-${n}`);
        }
      },
    },
    {
      key: 'getStreamHead',
      label: 'getStreamHead',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 7) % config.rows;
          const row = await table.get(`stream-${n}`);
          row?.stream?.[0] ?? null;
        }
      },
    },
    {
      key: 'containsPostQuery',
      label: 'containsPostQuery (*stream index vs scan)',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const target = `shared-post-${(i * 5) % 150}`;
          if (flags.streamIndex) {
            await table.where('stream').equals(target).toArray();
          } else {
            const matches = await table
              .filter((row) => Array.isArray(row.stream) && row.stream.includes(target))
              .toArray();
            matches.slice(0, 100);
          }
        }
      },
    },
  ];
}

const kindCycle = ['short', 'long', 'image', 'video', 'link'];
const deletedContent = '[deleted]';

function buildPostDetailsRows(rows) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `author-${i % 200}:post-${i}`,
      content: i % 11 === 0 ? deletedContent : `post ${i}`,
      indexed_at: now - i,
      kind: kindCycle[i % kindCycle.length],
      uri: `pubky://author-${i % 200}/pub/pubky.app/posts/post-${i}`,
      attachments: i % 4 === 0 ? [`file-${i}`] : null,
    });
  }
  return out;
}

async function bulkWrite(table, rows, method) {
  if (method === 'bulkAdd') {
    await table.bulkAdd(rows);
    return;
  }
  await table.bulkPut(rows);
}

async function seedTable(table, rows, method) {
  await table.clear();
  await bulkWrite(table, rows, method);
}

const benchSuites = [
  {
    key: 'feed',
    title: 'feed.schema.ts',
    tableName: 'feeds',
    baseline: {
      label: 'without updated_at index',
      schema: normalizeSchema('++id, name, created_at'),
      flags: { updatedAtIndex: false },
    },
    current: {
      label: 'current feedTableSchema (+updated_at)',
      schema: normalizeSchema('++id, name, created_at, updated_at'),
      flags: { updatedAtIndex: true },
    },
    buildRows: buildFeedRows,
    seedMethod: 'bulkAdd',
    workloads: ({ table, rows, config, flags }) => [
      {
        key: 'bulkInsert',
        label: 'bulkInsert',
        run: async () => {
          await seedTable(table, rows, 'bulkAdd');
          await table.clear();
        },
      },
      {
        key: 'updateUpdatedAt',
        label: 'updateUpdatedAt',
        run: async () => {
          const ops = [];
          for (let i = 0; i < Math.min(config.updateRows, config.rows); i++) {
            ops.push(table.update(i + 1, { updated_at: Date.now() + i }));
          }
          await Promise.all(ops);
        },
      },
      {
        key: 'nameLookupIndexed',
        label: 'nameLookupIndexed',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            await table
              .where('name')
              .equalsIgnoreCase(`Feed ${(i * 13) % config.rows}`)
              .first();
          }
        },
      },
      {
        key: 'createdSort',
        label: 'createdSort',
        run: async () => {
          await table.orderBy('created_at').reverse().limit(200).toArray();
        },
      },
      {
        key: 'updatedSort',
        label: 'updatedSort (index vs scan)',
        run: async () => {
          if (flags.updatedAtIndex) {
            await table.orderBy('updated_at').reverse().limit(200).toArray();
            return;
          }
          const all = await table.toArray();
          all.sort((a, b) => b.updated_at - a.updated_at);
          all.slice(0, 200);
        },
      },
    ],
  },
  {
    key: 'moderation',
    title: 'moderation.schema.ts',
    tableName: 'moderation',
    baseline: {
      label: 'baseline (&id, type, created_at)',
      schema: normalizeSchema('&id, type, created_at'),
      flags: { typeIndex: true },
    },
    current: {
      label: 'current moderationTableSchema',
      schema: normalizeSchema('&id, type'),
      flags: { typeIndex: true },
    },
    buildRows: buildModerationRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) => [
      {
        key: 'bulkInsert',
        label: 'bulkInsert',
        run: async () => {
          await seedTable(table, rows, 'bulkPut');
          await table.clear();
        },
      },
      {
        key: 'toggleBlur',
        label: 'toggleBlur',
        run: async () => {
          const ops = [];
          for (let i = 0; i < Math.min(config.updateRows, config.rows); i++) {
            const id = i % 2 === 0 ? `author-${i % 200}:post-${i}` : `pubky-user-${i}`;
            const isBlurred = i % 2 === 0;
            ops.push(table.update(id, { is_blurred: isBlurred }));
          }
          await Promise.all(ops);
        },
      },
      {
        key: 'typeQuery',
        label: 'typeQuery (index vs scan)',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const type = i % 2 === 0 ? 'post' : 'profile';
            if (flags.typeIndex) {
              await table.where('type').equals(type).limit(50).toArray();
            } else {
              const all = await table.filter((row) => row.type === type).toArray();
              all.slice(0, 50);
            }
          }
        },
      },
      {
        key: 'blurredQuery',
        label: 'blurredQuery (scan)',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const isBlurred = i % 2 === 0;
            const all = await table.filter((row) => row.is_blurred === isBlurred).toArray();
            all.slice(0, 50);
          }
        },
      },
      {
        key: 'idLookup',
        label: 'idLookup',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const n = (i * 17) % config.rows;
            const id = n % 2 === 0 ? `author-${n % 200}:post-${n}` : `pubky-user-${n}`;
            await table.get(id);
          }
        },
      },
    ],
  },
  {
    key: 'postCounts',
    title: 'postCounts.schema.ts',
    tableName: 'post_counts',
    baseline: {
      label: 'baseline (all fields indexed)',
      schema: normalizeSchema('&id, tags, unique_tags, reposts, replies'),
      flags: { countersIndexed: true },
    },
    current: {
      label: 'current postCountsTableSchema',
      schema: normalizeSchema('&id, tags, unique_tags, reposts, replies'),
      flags: { countersIndexed: true },
    },
    buildRows: buildPostCountsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) => [
      {
        key: 'bulkInsert',
        label: 'bulkInsert',
        run: async () => {
          await seedTable(table, rows, 'bulkPut');
          await table.clear();
        },
      },
      {
        key: 'updateCounters',
        label: 'updateCounters',
        run: async () => {
          const ops = [];
          for (let i = 0; i < Math.min(config.updateRows, config.rows); i++) {
            ops.push(
              table.update(`author-${i % 200}:post-${i}`, {
                tags: (i + 3) % 60,
                unique_tags: (i + 5) % 40,
                reposts: (i + 7) % 100,
                replies: (i + 11) % 160,
              }),
            );
          }
          await Promise.all(ops);
        },
      },
      {
        key: 'repliesRange',
        label: 'repliesRange (index vs scan)',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const threshold = (i * 9) % 120;
            if (flags.countersIndexed) {
              await table.where('replies').aboveOrEqual(threshold).limit(100).toArray();
            } else {
              const all = await table.filter((row) => row.replies >= threshold).toArray();
              all.slice(0, 100);
            }
          }
        },
      },
      {
        key: 'topReposts',
        label: 'topReposts (index vs scan)',
        run: async () => {
          if (flags.countersIndexed) {
            await table.orderBy('reposts').reverse().limit(100).toArray();
            return;
          }
          const all = await table.toArray();
          all.sort((a, b) => b.reposts - a.reposts);
          all.slice(0, 100);
        },
      },
      {
        key: 'idLookup',
        label: 'idLookup',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const n = (i * 19) % config.rows;
            await table.get(`author-${n % 200}:post-${n}`);
          }
        },
      },
    ],
  },
  {
    key: 'postTtl',
    title: 'postTtl.schema.ts',
    tableName: 'post_ttl',
    baseline: {
      label: 'legacy ttlTableSchema (&id, lastUpdatedAt)',
      schema: normalizeSchema('&id, lastUpdatedAt'),
      flags: {},
    },
    current: {
      label: 'current postTtlTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildPostTtlRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => [
      {
        key: 'bulkInsert',
        label: 'bulkInsert',
        run: async () => {
          await seedTable(table, rows, 'bulkPut');
          await table.clear();
        },
      },
      {
        key: 'bulkSaveBatch',
        label: 'bulkSaveBatch (bulkPut)',
        run: async () => {
          const updates = [];
          const limit = Math.min(config.updateRows, config.rows);
          const now = Date.now();
          for (let i = 0; i < limit; i++) {
            updates.push({ id: rows[i].id, lastUpdatedAt: now + i });
          }
          await table.bulkPut(updates);
        },
      },
      {
        key: 'touchUpserts',
        label: 'touchUpserts (put)',
        run: async () => {
          const limit = Math.min(config.updateRows, config.rows);
          const now = Date.now();
          for (let i = 0; i < limit; i++) {
            await table.put({ id: rows[i].id, lastUpdatedAt: now + i });
          }
        },
      },
      {
        key: 'findById',
        label: 'findById',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const n = (i * 19) % config.rows;
            await table.get(`author-${n % 200}:post-${n}`);
          }
        },
      },
      {
        key: 'findByIdsAnyOf',
        label: 'findByIdsAnyOf',
        run: async () => {
          const ids = [];
          const width = Math.min(300, config.rows);
          for (let i = 0; i < width; i++) {
            const n = (i * 9) % config.rows;
            ids.push(`author-${n % 200}:post-${n}`);
          }
          await table.where('id').anyOf(ids).toArray();
        },
      },
      {
        key: 'findStaleByIds',
        label: 'findStaleByIds (TTL flow)',
        run: async () => {
          const ids = [];
          const width = Math.min(300, config.rows);
          for (let i = 0; i < width; i++) {
            const n = (i * 13) % config.rows;
            ids.push(`author-${n % 200}:post-${n}`);
          }
          const uniqueIds = [...new Set(ids)];
          const ttlRecords = await table.where('id').anyOf(uniqueIds).toArray();
          const ttlMap = new Map(ttlRecords.map((r) => [r.id, r.lastUpdatedAt]));
          const now = Date.now();
          const ttlMs = 60 * 1000;
          uniqueIds.filter((id) => {
            const lastUpdatedAt = ttlMap.get(id);
            return lastUpdatedAt === undefined || now - lastUpdatedAt > ttlMs;
          });
        },
      },
    ],
  },
  {
    key: 'tagCollection',
    title: 'tag.schema.ts',
    tableName: 'tag_collections',
    baseline: {
      label: 'legacy tagCollectionTableSchema (&id, tags)',
      schema: normalizeSchema('&id, tags'),
      flags: {},
    },
    current: {
      label: 'current tagCollectionTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildTagCollectionRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildTagCollectionWorkloads({ table, rows, config }),
  },
  {
    key: 'postStream',
    title: 'postStream.schema.ts',
    tableName: 'post_streams',
    baseline: {
      label: 'id-only (&id)',
      schema: normalizeSchema('&id'),
      flags: { streamIndex: false },
    },
    current: {
      label: 'current postStreamTableSchema (&id, *stream)',
      schema: normalizeSchema('&id, *stream'),
      flags: { streamIndex: true },
    },
    buildRows: buildPostStreamRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) => buildPostStreamWorkloads({ table, rows, config, flags }),
  },
  {
    key: 'postRelationships',
    title: 'postRelationships.schema.ts',
    tableName: 'post_relationships',
    baseline: {
      label: 'legacy (&id, replied, reposted, mentioned)',
      schema: normalizeSchema('&id, replied, reposted, mentioned'),
      flags: { repliedIndex: true, repostedIndex: true, mentionedIndex: true },
    },
    current: {
      label: 'current postRelationshipsTableSchema (&id, replied, reposted)',
      schema: normalizeSchema('&id, replied, reposted'),
      flags: { repliedIndex: true, repostedIndex: true, mentionedIndex: false },
    },
    buildRows: buildPostRelationshipsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) =>
      buildPostRelationshipsWorkloads({ table, rows, config, flags, options: { includeRepostedQuery: true } }),
  },
  {
    key: 'postRelationshipsReposted',
    title: 'postRelationships.schema.ts (reposted index)',
    tableName: 'post_relationships',
    baseline: {
      label: 'minimal-safe (&id, replied)',
      schema: normalizeSchema('&id, replied'),
      flags: { repliedIndex: true, repostedIndex: false, mentionedIndex: false },
    },
    current: {
      label: 'with reposted (&id, replied, reposted)',
      schema: normalizeSchema('&id, replied, reposted'),
      flags: { repliedIndex: true, repostedIndex: true, mentionedIndex: false },
    },
    buildRows: buildPostRelationshipsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) =>
      buildPostRelationshipsWorkloads({ table, rows, config, flags, options: { includeRepostedQuery: true } }),
  },
  {
    key: 'postRelationshipsMentioned',
    title: 'postRelationships.schema.ts (*mentioned index)',
    tableName: 'post_relationships',
    baseline: {
      label: 'minimal-safe (&id, replied)',
      schema: normalizeSchema('&id, replied'),
      flags: { repliedIndex: true, repostedIndex: false, mentionedIndex: false },
    },
    current: {
      label: 'with *mentioned (&id, replied, *mentioned)',
      schema: normalizeSchema('&id, replied, *mentioned'),
      flags: { repliedIndex: true, repostedIndex: false, mentionedIndex: true },
    },
    buildRows: buildPostRelationshipsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config, flags }) =>
      buildPostRelationshipsWorkloads({ table, rows, config, flags, options: { includeMentionedQuery: true } }),
  },
  {
    key: 'postDetails',
    title: 'postDetails.schema.ts',
    tableName: 'post_details',
    baseline: {
      label: 'legacy (many secondary indexes)',
      schema: normalizeSchema('&id, content, indexed_at, kind, uri, attachments'),
      flags: { detailsIndexes: true },
    },
    current: {
      label: 'current postDetailsTableSchema',
      schema: normalizeSchema('&id'),
      flags: { detailsIndexes: false },
    },
    buildRows: buildPostDetailsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => [
      {
        key: 'bulkInsert',
        label: 'bulkInsert',
        run: async () => {
          await seedTable(table, rows, 'bulkPut');
          await table.clear();
        },
      },
      {
        key: 'bulkUpsertBatch',
        label: 'bulkUpsertBatch',
        run: async () => {
          const updates = [];
          const limit = Math.min(config.updateRows, config.rows);
          for (let i = 0; i < limit; i++) {
            const row = rows[i];
            updates.push({
              ...row,
              indexed_at: Date.now() + i,
              content: i % 7 === 0 ? `${row.content}*` : row.content,
            });
          }
          await table.bulkPut(updates);
        },
      },
      {
        key: 'updateContent',
        label: 'updateContent',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const n = (i * 23) % config.rows;
            const id = `author-${n % 200}:post-${n}`;
            await table.update(id, { content: `edited-${i}` });
          }
        },
      },
      {
        key: 'findById',
        label: 'findById',
        run: async () => {
          for (let i = 0; i < config.lookups; i++) {
            const n = (i * 23) % config.rows;
            await table.get(`author-${n % 200}:post-${n}`);
          }
        },
      },
      {
        key: 'bulkGetByIds',
        label: 'bulkGetByIds',
        run: async () => {
          const ids = [];
          const width = Math.min(200, config.rows);
          for (let i = 0; i < width; i++) {
            const n = (i * 11) % config.rows;
            ids.push(`author-${n % 200}:post-${n}`);
          }
          await table.bulkGet(ids);
        },
      },
      {
        key: 'filterDeletedByIds',
        label: 'filterDeletedByIds (bulkGet-style)',
        run: async () => {
          const ids = [];
          const width = Math.min(200, config.rows);
          for (let i = 0; i < width; i++) {
            const n = (i * 13) % config.rows;
            ids.push(`author-${n % 200}:post-${n}`);
          }

          const results = await table.bulkGet(ids);
          results.filter((row) => !row || row.content !== deletedContent);
        },
      },
    ],
  },
];

async function runSuiteVariant(suite, variantKey, variant, config) {
  console.log(`Running suite: ${suite.key} (${variantKey})`);
  const dbName = `bench-${suite.key}-${variantKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = await makeDb(dbName, { [suite.tableName]: variant.schema });
  const table = db.table(suite.tableName);
  const rows = suite.buildRows(config.rows);

  const workloadDefs = suite.workloads({ db, table, rows, config, flags: variant.flags });
  const results = {};

  try {
    for (const workload of workloadDefs) {
      if (workload.key !== 'bulkInsert') {
        await seedTable(table, rows, suite.seedMethod);
      }
      console.log(`  ${suite.key}/${variantKey}: ${workload.key}`);
      results[workload.key] = await measure(() => workload.run(), config.rounds);
    }
  } finally {
    await db.close();
    await Dexie.delete(dbName);
  }

  return { results, workloads: workloadDefs.map(({ key, label }) => ({ key, label })) };
}

function printSuiteComparison(suite, baselineRun, currentRun, config) {
  console.log(`\n${suite.title} (${suite.tableName})`);
  console.log(`baseline: ${suite.baseline.label} -> ${suite.baseline.schema}`);
  console.log(`current : ${suite.current.label} -> ${suite.current.schema}`);
  console.log(`Rows=${config.rows}, Updates=${config.updateRows}, Lookups=${config.lookups}, Rounds=${config.rounds}`);
  console.log('-----------------------------------------------------------------------');
  console.log('Workload                         baseline      current       delta');
  console.log('-----------------------------------------------------------------------');

  for (const workload of baselineRun.workloads) {
    const oldT = baselineRun.results[workload.key];
    const newT = currentRun.results[workload.key];
    const pad = workload.label.padEnd(30, ' ');
    console.log(`${pad} ${fmt(oldT).padEnd(12)} ${fmt(newT).padEnd(12)} ${pct(oldT, newT)}`);
  }

  console.log('-----------------------------------------------------------------------');
}

async function main() {
  const config = {
    rows: ROWS,
    updateRows: UPDATE_ROWS,
    lookups: LOOKUPS,
    rounds: ROUNDS,
  };

  for (const suite of benchSuites) {
    const baselineRun = await runSuiteVariant(suite, 'baseline', suite.baseline, config);
    const currentRun = await runSuiteVariant(suite, 'current', suite.current, config);
    printSuiteComparison(suite, baselineRun, currentRun, config);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
