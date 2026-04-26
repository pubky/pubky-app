# Architecture Decision Enforcement

## Layer Boundary Summary

Entry points (UI, Coordinators) -> Controllers -> Application -> Services -> Models

- Controllers may also call Pipes (normalization) and Stores (UI state)
- Application is NOT an entry point — only Controllers call it
- Services are IO boundaries — only Application calls them

## Controller Naming Conventions

- `fetch*` — network only, no cache
- `get*` — read from local only
- `getMany*` — bulk local reads, returns `Map<Pubky, T>`
- `getOrFetch*` — local first, network fallback
- `getMany*OrFetch` — bulk local first, fetch missing (e.g., `getManyTagsOrFetch`)
- `commitCreate*` / `commitUpdate*` / `commitDelete*` — optimistic local write + network sync

## Error Handling

- Use `Err.*` factories — they log automatically
- Never log then throw `Err.*` (double logging)
- Re-throw `AppError` unchanged; normalize unknowns with `toAppError()`
- Use `safeFetch` + `httpResponseToError` for HTTP calls
- Check `category`/`code` not message strings

## Data Patterns

- Posts use composite IDs: `author:postId`
- Always update TTL after writes
- External data must pass through pipes before reaching controllers
- Pipes are pure — no IO, no side effects

## Component Standards

- Shadcn first — check for existing primitives before building custom
- Design tokens only — no hardcoded colors (`bg-primary` not `bg-[#1a1a1a]`)
- Z-index: use standard scale (-z-10, z-10, z-30, z-40, z-50, z-60)
- Skeleton counts from constants/props, never hardcoded

### Icons

- **Stock Lucide**: `import { IconName } from 'lucide-react'` — never re-export the whole package from `@/libs` or other app barrels (`export * from 'lucide-react'` is forbidden).
- **Custom / brand SVGs**: `import { CustomMark } from '@/icons'` — alias → `src/libs/icons/icons.tsx` (see `docs/components.md`).
- **URL → icon / label**: `getIconFromUrl`, `getLabelFromUrl`, etc. from `@/libs/utils` (`src/libs/utils/urlToIcon.ts`), not from `@/icons`.

## Code Quality

### No suppressed linter warnings without explanation

Every `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore`, and `@ts-expect-error` must have an adjacent comment explaining _why_ the suppression is necessary and what would break without it. Bare suppressions hide real bugs and erode trust in the lint suite. If a rule is genuinely wrong for the entire file, prefer `eslint-disable` at the top with a rationale over sprinkling inline ignores.

```typescript
// BAD
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response.body;

// GOOD
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Nexus returns untyped JSON; normalised in PostNormalizer.to
const data: any = response.body;
```

### Eliminate dead code

Remove unreachable branches, unused variables, commented-out blocks, and code guarded by conditions that are always true or false. Dead code misleads readers about what the system actually does and inflates bundle size. Don't comment code out "for later" — git history preserves it. If a feature flag is permanently on or off, collapse the branch.

```typescript
// BAD — feature flag removed months ago, condition always true
if (ENABLE_NEW_FEED) {
  renderNewFeed();
} else {
  renderLegacyFeed(); // unreachable
}

// GOOD
renderNewFeed();
```

### Audit redundant exports

If a symbol (`function`, `const`, `type`, `class`) is exported but never imported by any other file in the codebase, it should be removed or demoted to a non-exported local. Stale exports clutter the public API surface and signal code that was once used but no longer is. The only exception is symbols consumed by an external package or test harness — in that case, add a short comment like `// exported for integration tests`.

### Challenge unnecessary useCallback / useMemo

This project uses the React Compiler, which automatically memoizes component renders and callbacks. Manual `useCallback` and `useMemo` wrappers are therefore redundant in most cases and add visual noise. Flag them during review unless the author can cite a specific reason the compiler cannot handle the case (e.g., a dependency the compiler doesn't track, a ref-stable callback passed to a non-React subscriber, or a measured performance hotspot with profiler evidence).

```typescript
// LIKELY REDUNDANT — React Compiler handles this
const handleClick = useCallback(() => {
  PostController.commitDelete({ compositePostId });
}, [compositePostId]);

// JUST WRITE
const handleClick = () => {
  PostController.commitDelete({ compositePostId });
};
```

### Avoid barrel re-exports

Don't create `index.ts` files whose sole purpose is re-exporting from child modules, and don't re-export constants or functions through intermediate modules without good reason. Barrel files add a layer of indirection that confuses IDE go-to-definition, makes circular dependency bugs harder to trace, and can defeat tree-shaking in bundlers. Import directly from the source module instead.

```typescript
// BAD — barrel that just re-exports
// src/core/post/index.ts
export { PostController } from './controllers/post.controller';
export { PostApplication } from './application/post.application';

// GOOD — import from the actual file
import { PostController } from '@/core/controllers/post/post';
```

Exception: the top-level `src/components/atoms/index.ts` barrel is intentional for grouping atomic components — that pattern is established and acceptable.

### Scrutinize optional parameters

When a function accepts optional parameters that meaningfully change its behavior (not just default values), prefer splitting into separate functions or using explicit overloads. A single function with 3-4 optional params often hides multiple responsibilities behind one name, making call sites ambiguous and testing harder.

```typescript
// SUSPICIOUS — what does it mean when both are omitted vs provided?
function fetchStream(streamId: string, cursor?: string, limit?: number, includeReplies?: boolean);

// CLEARER — separate intent
function fetchStream(streamId: string, options: FetchStreamOptions);
function fetchNextPage(streamId: string, cursor: string, limit: number);
```
