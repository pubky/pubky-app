/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Dexie, { type Table } from 'dexie';
import { useMemo, useState } from 'react';

type BenchConfig = {
  rows: number;
  updateRows: number;
  lookups: number;
  rounds: number;
};

type VariantFlags = Record<string, boolean>;

type SuiteVariant = {
  label: string;
  schema: string;
  flags: VariantFlags;
};

type WorkloadDef = {
  key: string;
  label: string;
  run: () => Promise<void>;
};

type SuiteDef = {
  key: string;
  title: string;
  tableName: string;
  baseline: SuiteVariant;
  current: SuiteVariant;
  buildRows: (rows: number) => any[];
  seedMethod: 'bulkAdd' | 'bulkPut';
  workloads: (args: {
    db: Dexie;
    table: Table<any, any>;
    rows: any[];
    config: BenchConfig;
    flags: VariantFlags;
  }) => WorkloadDef[];
};

type SuiteRunResult = {
  results: Record<string, number>;
  workloads: Array<Pick<WorkloadDef, 'key' | 'label'>>;
};

type SuiteComparisonResult = {
  key: string;
  title: string;
  tableName: string;
  baselineLabel: string;
  currentLabel: string;
  baselineSchema: string;
  currentSchema: string;
  workloads: Array<Pick<WorkloadDef, 'key' | 'label'>>;
  baseline: Record<string, number>;
  current: Record<string, number>;
};

const DEFAULT_CONFIG: BenchConfig = {
  rows: 2000,
  updateRows: 500,
  lookups: 150,
  rounds: 2,
};

function normalizeSchema(schema: string): string {
  return schema
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function formatDelta(base: number, next: number): string {
  if (base === 0) return 'n/a';
  const delta = ((next - base) / base) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function measure(task: () => Promise<void>, rounds: number): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    await task();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

async function bulkWrite(table: Table<any, any>, rows: any[], method: 'bulkAdd' | 'bulkPut') {
  if (method === 'bulkAdd') {
    await table.bulkAdd(rows);
    return;
  }
  await table.bulkPut(rows);
}

async function seedTable(table: Table<any, any>, rows: any[], method: 'bulkAdd' | 'bulkPut') {
  await table.clear();
  await bulkWrite(table, rows, method);
}

function buildFeedRows(rows: number) {
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

function buildModerationRows(rows: number) {
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

function buildPostCountsRows(rows: number) {
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

function buildUserCountsRows(rows: number) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `pubky-user-${i}`,
      tagged: i % 80,
      tags: i % 60,
      unique_tags: i % 35,
      posts: i % 120,
      replies: i % 90,
      following: i % 500,
      followers: i % 700,
      friends: i % 300,
      bookmarks: i % 200,
    });
  }
  return out;
}

function buildUserDetailsRows(rows: number) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `pubky-user-${i}`,
      name: `User ${i}`,
      bio: `Bio for user ${i} with some profile text`,
      image: i % 4 === 0 ? null : `https://cdn.example.com/avatar/${i}.jpg`,
      indexed_at: now - i * 1000,
      links:
        i % 3 === 0
          ? null
          : [
              { title: 'Website', url: `https://example.com/u/${i}` },
              ...(i % 5 === 0 ? [{ title: 'GitHub', url: `https://github.com/user-${i}` }] : []),
            ],
      status: i % 6 === 0 ? null : i % 2 === 0 ? 'online' : 'offline',
    });
  }
  return out;
}

function buildUserRelationshipsRows(rows: number) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `pubky-user-${i}`,
      following: i % 2 === 0,
      followed_by: i % 3 === 0,
      muted: i % 7 === 0,
    });
  }
  return out;
}

function buildUserTtlRows(rows: number) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `pubky-user-${i}`,
      lastUpdatedAt: i % 3 === 0 ? now - 5 * 60 * 1000 - i : now - (i % 45) * 1000,
    });
  }
  return out;
}

function buildPostTtlRows(rows: number) {
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

function buildUserConnectionsRows(rows: number) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const following = [];
    const followers = [];
    const count = 4 + (i % 6);
    for (let j = 0; j < count; j++) {
      following.push(`pubky-following-${(i * 7 + j) % (rows * 2)}`);
      followers.push(`pubky-follower-${(i * 11 + j) % (rows * 2)}`);
    }
    out.push({
      id: `pubky-user-${i}`,
      following,
      followers,
    });
  }
  return out;
}

function buildTagCollectionRows(rows: number) {
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

function buildPostStreamRows(rows: number) {
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

function buildPostRelationshipsRows(rows: number) {
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

function buildPostRelationshipsWorkloads({
  table,
  rows,
  config,
  flags,
  options = {},
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
  flags: VariantFlags;
  options?: { includeRepostedQuery?: boolean; includeMentionedQuery?: boolean };
}): WorkloadDef[] {
  const { includeRepostedQuery = false, includeMentionedQuery = false } = options;

  const workloads: WorkloadDef[] = [
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
        const ids: string[] = [];
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

function buildUserConnectionsWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
      key: 'bulkUpsertBatch',
      label: 'bulkUpsertBatch',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        const updates = [];
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            id: row.id,
            following: [`pubky-new-following-${i}`, ...row.following.slice(0, 7)],
            followers: row.followers.slice(1).concat(`pubky-new-follower-${i}`),
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'createConnectionFollowing',
      label: 'createConnectionFollowing (modify)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const id = `pubky-user-${i}`;
          const to = `pubky-target-${i}`;
          await table
            .where('id')
            .equals(id)
            .modify((row: any) => {
              const list = row.following ?? [];
              if (!list.includes(to)) {
                row.following = [...list, to];
              }
            });
        }
      },
    },
    {
      key: 'deleteConnectionFollowers',
      label: 'deleteConnectionFollowers (modify)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const id = `pubky-user-${i}`;
          await table
            .where('id')
            .equals(id)
            .modify((row: any) => {
              const list = row.followers ?? [];
              if (list.length > 0) {
                row.followers = list.slice(1);
              }
            });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 17) % config.rows;
          await table.get(`pubky-user-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 13) % config.rows;
          ids.push(`pubky-user-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
  ];
}

function buildUserCountsWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
      key: 'bulkUpsertBatch',
      label: 'bulkUpsertBatch',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            ...row,
            tagged: (row.tagged + 1) % 200,
            tags: (row.tags + 2) % 200,
            unique_tags: (row.unique_tags + 1) % 100,
            posts: (row.posts + 1) % 300,
            replies: (row.replies + 1) % 200,
            following: (row.following + 1) % 1000,
            followers: (row.followers + 2) % 1200,
            friends: (row.friends + 1) % 600,
            bookmarks: (row.bookmarks + 1) % 400,
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'updateCountsLikeFlow',
      label: 'updateCountsLikeFlow (update)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const id = `pubky-user-${i}`;
          await table.update(id, {
            following: (i + 1) % 1000,
            followers: (i + 2) % 1200,
            friends: i % 600,
            bookmarks: (i + 3) % 400,
          });
        }
      },
    },
    {
      key: 'followCountersPairUpdates',
      label: 'followCountersPairUpdates (2 users)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows - 1);
        for (let i = 0; i < limit; i++) {
          await table.update(`pubky-user-${i}`, { following: (i + 5) % 1000, friends: (i + 7) % 600 });
          await table.update(`pubky-user-${i + 1}`, { followers: (i + 9) % 1200, friends: (i + 11) % 600 });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 19) % config.rows;
          await table.get(`pubky-user-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 11) % config.rows;
          ids.push(`pubky-user-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
  ];
}

function buildUserDetailsWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
      key: 'bulkUpsertBatch',
      label: 'bulkUpsertBatch',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            ...row,
            name: `${row.name}*`,
            indexed_at: Date.now() + i,
            status: i % 3 === 0 ? 'away' : row.status,
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'updateProfileFields',
      label: 'updateProfileFields (update)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          await table.update(`pubky-user-${i}`, {
            name: `Renamed ${i}`,
            bio: `Updated bio ${i}`,
            indexed_at: Date.now() + i,
            status: i % 2 === 0 ? 'online' : 'offline',
          });
        }
      },
    },
    {
      key: 'updateLinksStatus',
      label: 'updateLinksStatus (update)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          await table.update(`pubky-user-${i}`, {
            links: [{ title: 'App', url: `https://app.example.com/${i}` }],
            status: i % 4 === 0 ? null : 'online',
          });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 19) % config.rows;
          await table.get(`pubky-user-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 7) % config.rows;
          ids.push(`pubky-user-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
  ];
}

function buildUserRelationshipsWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
      key: 'bulkUpsertBatch',
      label: 'bulkUpsertBatch',
      run: async () => {
        const updates = [];
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          const row = rows[i];
          updates.push({
            ...row,
            following: !row.following,
            followed_by: i % 4 === 0 ? !row.followed_by : row.followed_by,
            muted: i % 5 === 0 ? !row.muted : row.muted,
          });
        }
        await table.bulkPut(updates);
      },
    },
    {
      key: 'updateFollowFlag',
      label: 'updateFollowFlag (update)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          await table.update(`pubky-user-${i}`, { following: i % 2 === 0, followed_by: i % 3 === 0 });
        }
      },
    },
    {
      key: 'toggleMuted',
      label: 'toggleMuted (update)',
      run: async () => {
        const limit = Math.min(config.updateRows, config.rows);
        for (let i = 0; i < limit; i++) {
          await table.update(`pubky-user-${i}`, { muted: i % 2 === 1 });
        }
      },
    },
    {
      key: 'findById',
      label: 'findById',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const n = (i * 17) % config.rows;
          await table.get(`pubky-user-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(200, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 9) % config.rows;
          ids.push(`pubky-user-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
    {
      key: 'mutedScan',
      label: 'mutedScan',
      run: async () => {
        for (let i = 0; i < config.lookups; i++) {
          const matches = await table.filter((row: any) => row.muted === (i % 2 === 0)).toArray();
          matches.slice(0, 100);
        }
      },
    },
  ];
}

function buildUserTtlWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
          await table.get(`pubky-user-${n}`);
        }
      },
    },
    {
      key: 'findByIdsAnyOf',
      label: 'findByIdsAnyOf',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(300, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 9) % config.rows;
          ids.push(`pubky-user-${n}`);
        }
        await table.where('id').anyOf(ids).toArray();
      },
    },
    {
      key: 'findStaleByIds',
      label: 'findStaleByIds (TTL flow)',
      run: async () => {
        const ids: string[] = [];
        const width = Math.min(300, config.rows);
        for (let i = 0; i < width; i++) {
          const n = (i * 13) % config.rows;
          ids.push(`pubky-user-${n}`);
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
  ];
}

function buildTagCollectionWorkloads({
  table,
  rows,
  config,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
}): WorkloadDef[] {
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
          const nextTags = row.tags.slice(0, 4).map((tag: any, idx: number) => ({
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
        const ids: string[] = [];
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

function buildPostStreamWorkloads({
  table,
  rows,
  config,
  flags,
}: {
  table: Table<any, any>;
  rows: any[];
  config: BenchConfig;
  flags: VariantFlags;
}): WorkloadDef[] {
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
            .modify((row: any) => {
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
              .filter((row: any) => Array.isArray(row.stream) && row.stream.includes(target))
              .toArray();
            matches.slice(0, 100);
          }
        }
      },
    },
  ];
}

const KIND_CYCLE = ['short', 'long', 'image', 'video', 'link'] as const;
const DELETED_CONTENT = '[deleted]';

function buildPostDetailsRows(rows: number) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < rows; i++) {
    out.push({
      id: `author-${i % 200}:post-${i}`,
      content: i % 11 === 0 ? DELETED_CONTENT : `post ${i}`,
      indexed_at: now - i,
      kind: KIND_CYCLE[i % KIND_CYCLE.length],
      uri: `pubky://author-${i % 200}/pub/pubky.app/posts/post-${i}`,
      attachments: i % 4 === 0 ? [`file-${i}`] : null,
    });
  }
  return out;
}

const BENCH_SUITES: SuiteDef[] = [
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
          const ops: Promise<unknown>[] = [];
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
      schema: normalizeSchema(`
        &id,
        type
      `),
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
          const ops: Promise<unknown>[] = [];
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
              const matches = await table.filter((row) => row.type === type).toArray();
              matches.slice(0, 50);
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
            const matches = await table.filter((row) => row.is_blurred === isBlurred).toArray();
            matches.slice(0, 50);
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
      schema: normalizeSchema(`
        &id,
        tags,
        unique_tags,
        reposts,
        replies
      `),
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
          const ops: Promise<unknown>[] = [];
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
              const matches = await table.filter((row) => row.replies >= threshold).toArray();
              matches.slice(0, 100);
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
    key: 'userCounts',
    title: 'userCounts.schema.ts',
    tableName: 'user_counts',
    baseline: {
      label: 'legacy (&id, tagged, tags, unique_tags, posts, replies, following, followers, friends, bookmarks)',
      schema: normalizeSchema(`
        &id,
        tagged,
        tags,
        unique_tags,
        posts,
        replies,
        following,
        followers,
        friends,
        bookmarks
      `),
      flags: {},
    },
    current: {
      label: 'current userCountsTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildUserCountsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildUserCountsWorkloads({ table, rows, config }),
  },
  {
    key: 'userDetails',
    title: 'userDetails.schema.ts',
    tableName: 'user_details',
    baseline: {
      label: 'legacy (&id, name, bio, image, indexed_at, links, status)',
      schema: normalizeSchema(`
        &id,
        name,
        bio,
        image,
        indexed_at,
        links,
        status
      `),
      flags: {},
    },
    current: {
      label: 'current userDetailsTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildUserDetailsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildUserDetailsWorkloads({ table, rows, config }),
  },
  {
    key: 'userRelationships',
    title: 'userRelationships.schema.ts',
    tableName: 'user_relationships',
    baseline: {
      label: 'legacy (&id, following, followed_by, muted)',
      schema: normalizeSchema(`
        &id,
        following,
        followed_by,
        muted
      `),
      flags: {},
    },
    current: {
      label: 'current userRelationshipsTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildUserRelationshipsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildUserRelationshipsWorkloads({ table, rows, config }),
  },
  {
    key: 'userTtl',
    title: 'userTtl.schema.ts',
    tableName: 'user_ttl',
    baseline: {
      label: 'legacy ttlTableSchema (&id, lastUpdatedAt)',
      schema: normalizeSchema('&id, lastUpdatedAt'),
      flags: {},
    },
    current: {
      label: 'current userTtlTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildUserTtlRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildUserTtlWorkloads({ table, rows, config }),
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
          const ids: string[] = [];
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
          const ids: string[] = [];
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
    key: 'userConnections',
    title: 'userConnections.schema.ts',
    tableName: 'user_connections',
    baseline: {
      label: 'legacy (&id, followers, following)',
      schema: normalizeSchema('&id, followers, following'),
      flags: {},
    },
    current: {
      label: 'current userConnectionsTableSchema (&id)',
      schema: normalizeSchema('&id'),
      flags: {},
    },
    buildRows: buildUserConnectionsRows,
    seedMethod: 'bulkPut',
    workloads: ({ table, rows, config }) => buildUserConnectionsWorkloads({ table, rows, config }),
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
          const ids: string[] = [];
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
          const ids: string[] = [];
          const width = Math.min(200, config.rows);
          for (let i = 0; i < width; i++) {
            const n = (i * 13) % config.rows;
            ids.push(`author-${n % 200}:post-${n}`);
          }

          const results = await table.bulkGet(ids);
          results.filter((row) => !row || row.content !== DELETED_CONTENT);
        },
      },
    ],
  },
];

async function createDb(name: string, schema: Record<string, string>): Promise<Dexie> {
  try {
    await Dexie.delete(name);
  } catch {
    // ignore cleanup failures from previous blocked contexts
  }

  const db = new Dexie(name);
  db.version(1).stores(schema);
  await db.open();
  return db;
}

async function runSuiteVariant({
  suite,
  variantKey,
  variant,
  config,
  setPhase,
}: {
  suite: SuiteDef;
  variantKey: 'baseline' | 'current';
  variant: SuiteVariant;
  config: BenchConfig;
  setPhase: (value: string) => void;
}): Promise<SuiteRunResult> {
  const dbName = `idb-bench-${suite.key}-${variantKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = await createDb(dbName, { [suite.tableName]: variant.schema });
  const table = db.table(suite.tableName);
  const rows = suite.buildRows(config.rows);
  const workloadDefs = suite.workloads({ db, table, rows, config, flags: variant.flags });
  const results: Record<string, number> = {};

  try {
    for (const workload of workloadDefs) {
      if (workload.key !== 'bulkInsert') {
        await seedTable(table, rows, suite.seedMethod);
      }
      setPhase(`${suite.key}/${variantKey}: ${workload.key}`);
      results[workload.key] = await measure(() => workload.run(), config.rounds);
    }
  } finally {
    db.close();
    try {
      await Dexie.delete(dbName);
    } catch {
      // ignore cleanup failures
    }
  }

  return {
    results,
    workloads: workloadDefs.map(({ key, label }) => ({ key, label })),
  };
}

export default function IndexedDbBenchPage() {
  const [config, setConfig] = useState<BenchConfig>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [suiteResults, setSuiteResults] = useState<SuiteComparisonResult[]>([]);

  const totalDuration = useMemo(() => {
    if (!startedAt || !finishedAt) return null;
    return finishedAt - startedAt;
  }, [startedAt, finishedAt]);

  const handleConfigChange = (key: keyof BenchConfig, value: number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const runBenchmark = async () => {
    setError(null);
    setIsRunning(true);
    setSuiteResults([]);
    setStartedAt(performance.now());
    setFinishedAt(null);

    try {
      const completed: SuiteComparisonResult[] = [];

      for (const suite of BENCH_SUITES) {
        const baselineRun = await runSuiteVariant({
          suite,
          variantKey: 'baseline',
          variant: suite.baseline,
          config,
          setPhase,
        });

        const currentRun = await runSuiteVariant({
          suite,
          variantKey: 'current',
          variant: suite.current,
          config,
          setPhase,
        });

        completed.push({
          key: suite.key,
          title: suite.title,
          tableName: suite.tableName,
          baselineLabel: suite.baseline.label,
          currentLabel: suite.current.label,
          baselineSchema: suite.baseline.schema,
          currentSchema: suite.current.schema,
          workloads: baselineRun.workloads,
          baseline: baselineRun.results,
          current: currentRun.results,
        });

        setSuiteResults([...completed]);
      }

      setPhase('done');
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Unknown benchmark error';
      setError(message);
      setPhase('failed');
    } finally {
      setIsRunning(false);
      setFinishedAt(performance.now());
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <h1 className="text-xl font-semibold">IndexedDB Dexie Schema Benchmarks</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Runs schema-specific benchmarks in your browser for feed, moderation, postCounts, and postDetails. Delta is
        current schema vs baseline for each table.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          Rows
          <input
            className="rounded border px-2 py-1"
            type="number"
            min={100}
            step={100}
            value={config.rows}
            onChange={(event) => handleConfigChange('rows', Number(event.target.value))}
            disabled={isRunning}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Update Rows
          <input
            className="rounded border px-2 py-1"
            type="number"
            min={50}
            step={50}
            value={config.updateRows}
            onChange={(event) => handleConfigChange('updateRows', Number(event.target.value))}
            disabled={isRunning}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lookups
          <input
            className="rounded border px-2 py-1"
            type="number"
            min={20}
            step={10}
            value={config.lookups}
            onChange={(event) => handleConfigChange('lookups', Number(event.target.value))}
            disabled={isRunning}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Rounds
          <input
            className="rounded border px-2 py-1"
            type="number"
            min={1}
            step={1}
            value={config.rounds}
            onChange={(event) => handleConfigChange('rounds', Number(event.target.value))}
            disabled={isRunning}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={runBenchmark}
          disabled={isRunning}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run Benchmark'}
        </button>
        <span className="text-sm text-muted-foreground">Phase: {phase || 'idle'}</span>
      </div>

      {totalDuration != null && (
        <p className="mt-2 text-sm text-muted-foreground">Total duration: {formatMs(totalDuration)}</p>
      )}

      {error && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</p>
      )}

      <div className="mt-6 space-y-6">
        {suiteResults.map((suite) => (
          <section key={suite.key} className="overflow-x-auto rounded border">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{suite.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Table: {suite.tableName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Baseline: {suite.baselineLabel} (`{suite.baselineSchema}`)
              </p>
              <p className="text-xs text-muted-foreground">
                Current: {suite.currentLabel} (`{suite.currentSchema}`)
              </p>
            </div>

            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Workload</th>
                  <th className="px-3 py-2">Baseline</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                {suite.workloads.map((workload) => {
                  const baselineValue = suite.baseline[workload.key];
                  const currentValue = suite.current[workload.key];
                  return (
                    <tr key={workload.key} className="border-t">
                      <td className="px-3 py-2 font-mono">{workload.label}</td>
                      <td className="px-3 py-2">{formatMs(baselineValue)}</td>
                      <td className="px-3 py-2">{formatMs(currentValue)}</td>
                      <td className="px-3 py-2">{formatDelta(baselineValue, currentValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
