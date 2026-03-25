# Z-Index Conventions

Standard z-index values for consistent stacking order throughout the application.

## Z-Index Scale

| Value   | Purpose                     | Examples                                     |
| ------- | --------------------------- | -------------------------------------------- |
| `-z-10` | Background elements         | `ImageBackground` — fixed backgrounds        |
| `z-10`  | Sticky/relative overlays    | `ProgressSteps`, `ButtonFilters`, badges     |
| `z-30`  | Floating buttons (scrolled) | `NewPostsButton` when scrolled               |
| `z-40`  | Fixed navigation & FAB      | `NewPostCTA`, `MobileFooter`, dialog overlay |
| `z-50`  | Modals, dialogs, popovers   | `Dialog`, `Sheet`, `Popover`, dropdowns      |
| `z-60`  | Modal controls              | Close buttons on lightboxes                  |

## Layer Hierarchy

```
z-60  ─────────────  Modal controls (close buttons on lightboxes)
z-50  ─────────────  Modals, dialogs, sheets, popovers
z-40  ─────────────  FAB, mobile footer, dialog overlays
z-30  ─────────────  Floating UI elements (scrolled state)
z-10  ─────────────  Sticky headers, relative overlays
z-0   ─────────────  Normal document flow
-z-10 ─────────────  Background images
```

## When to Use Each Level

### `-z-10` Background

```tsx
<div className="fixed inset-0 -z-10">
  <ImageBackground src={bg} />
</div>
```

### `z-10` Sticky/Relative

```tsx
<div className="sticky top-0 z-10">
  <FilterBar />
</div>

<Badge className="absolute -top-1 -right-1 z-10">3</Badge>
```

### `z-30` Floating (Scrolled)

```tsx
<Button className={cn('fixed bottom-20', isScrolled && 'z-30')}>New posts available</Button>
```

### `z-40` Fixed Navigation

```tsx
<nav className="fixed bottom-0 z-40">
  <MobileFooter />
</nav>

<Button className="fixed bottom-20 right-4 z-40">
  <PlusIcon /> {/* FAB */}
</Button>

<DialogOverlay className="fixed inset-0 z-40 bg-black/50" />
```

### `z-50` Modals

```tsx
<DialogContent className="fixed z-50">
  {children}
</DialogContent>

<SheetContent className="fixed z-50">
  {children}
</SheetContent>

<PopoverContent className="z-50">
  {children}
</PopoverContent>
```

### `z-60` Modal Controls

```tsx
<div className="relative">
  <ImageLightbox />
  <Button className="absolute top-2 right-2 z-60">
    <CloseIcon />
  </Button>
</div>
```

## Component Reference

### Background (`-z-10`)

- `ImageBackground`

### Sticky/Relative (`z-10`)

- `ProgressSteps`
- `ButtonFilters`
- `WordSlot` badges
- `ProfilePageEmptyState`

### Floating (`z-30`)

- `NewPostsButton` (when scrolled)

### Fixed Navigation (`z-40`)

- `NewPostCTA` (FAB)
- `MobileFooter`
- `DialogOverlay`

### Modals (`z-50`)

- `Dialog` / `DialogContent`
- `Sheet` / `SheetContent`
- `SideDrawer`
- `Popover` / `PopoverContent`
- `SearchInput` dropdown
- `TagInput` dropdown
- `Language` dropdown

### Modal Controls (`z-60`)

- `PostAttachmentsImagesAndVideos` close button

## Rules

1. **Dialogs and modals**: `z-50` for content, `z-40` for backdrop overlay
2. **FAB buttons**: `z-40` (above content, below modals)
3. **Fixed navigation**: `z-40` (same as FAB)
4. **Popovers/dropdowns**: `z-50` (above fixed elements when open)
5. **Nested overlays**: Increment by 10 per level (rare)

## Anti-Patterns

```tsx
// BAD: Arbitrary z-index values
<div className="z-[999]">...</div>
<div className="z-[100]">...</div>

// GOOD: Use standard scale
<div className="z-50">...</div>

// BAD: Missing z-index on fixed/absolute elements
<div className="fixed bottom-0">
  <Footer />
</div>

// GOOD: Explicit z-index
<div className="fixed bottom-0 z-40">
  <Footer />
</div>
```

## Adding New Z-Index Values

Before adding a new z-index:

1. Check if an existing level fits your use case
2. If new level needed, use increments of 10
3. Document the new level in this file
4. Consider impact on existing components

## Quick Checklist

When adding positioned elements:

- [ ] Is z-index needed? (fixed, absolute, sticky)
- [ ] Using standard scale (-z-10, z-10, z-30, z-40, z-50, z-60)?
- [ ] Matches similar components in the hierarchy?
- [ ] Modal content at z-50, backdrop at z-40?
