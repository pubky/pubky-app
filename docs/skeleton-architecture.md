# Skeleton Architecture

Use a hybrid structure for skeleton loaders to balance reuse and locality.

## Placement Model

### Reusable skeletons

Use a standalone component folder when the skeleton is reused by multiple parents or represents a generic UI pattern.

Example:

```
src/components/organisms/FullUserListItemSkeleton/
├── FullUserListItemSkeleton.tsx
├── FullUserListItemSkeleton.test.tsx
└── index.ts
```

### Feature-private skeletons

Use a colocated file for loading states owned by a single component.

Example:

```
src/components/organisms/HotTagsCardsSection/
├── HotTagsCardsSection.tsx
├── HotTagsCardsSection.skeleton.tsx
└── ...
```

## Promotion Rule

- If a colocated `*.skeleton.tsx` is used by 2 or more parent components, promote it to a standalone reusable skeleton component folder.
- If a skeleton remains single-owner, keep it colocated.

## Naming and Exports

- Component name: `XxxSkeleton`.
- Private file name: `Xxx.skeleton.tsx`.
- Reusable file name: `XxxSkeleton.tsx` in its own folder.
- Export reusable skeletons from relevant barrel files.
- Do not export feature-private skeletons from global barrels (`src/components/organisms/index.ts`, etc.).

## Implementation Rules

- Build loaders with shared `Atoms.Skeleton` (Shadcn-based) primitives.
- Avoid ad-hoc placeholder markup that bypasses `Atoms.Skeleton`.
- Keep skeleton layout aligned with the loaded UI structure (spacing, responsive behavior, hierarchy).
- Never hardcode counts or quantities in skeletons. If the loaded component derives a count from a constant or a prop, the skeleton must use the same constant or accept an equivalent prop. Hardcoded literals silently diverge when the source of truth changes.
- If a skeleton count is responsive (varies by viewport or context), accept it as a prop with a sensible constant as the default. The parent already has the computed value at render time and should pass it down.

## Testing Rules

- Reusable skeleton components should have direct unit/snapshot tests.
- Feature-private skeletons should be validated through the parent component loading-state tests.
- Skeleton components that are queried by `data-testid` in parent loading-state tests must own that attribute directly on the rendered element. Never rely on a test mock to inject `data-testid` — the mock should forward props, not hardcode them.

## Quick Checklist

- [ ] Is this skeleton reused by multiple parents? If yes, standalone component.
- [ ] If single-owner, is it colocated as `*.skeleton.tsx`?
- [ ] Does it use `Atoms.Skeleton` consistently?
- [ ] Are exports limited to reusable skeletons only?
- [ ] Are loading states covered by tests (direct or parent-level)?
- [ ] If queried by `data-testid` in a test, does the skeleton component itself set that attribute (not just the mock)?
- [ ] Are all counts/quantities sourced from constants or props — no hardcoded literals?
- [ ] If a count is responsive, is it a prop (with a constant default) passed from the parent?
