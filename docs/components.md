# Component Development

Rules and patterns for developing UI components. Based on atomic design with Shadcn UI.

## Core Principles

### 1. Shadcn First

**ALWAYS check if Shadcn has an equivalent before creating custom components.**

```bash
npx shadcn@latest add [component] --yes
```

Then adapt to project structure. Don't recreate from scratch.

### 2. Figma Parity

**100% visual match with Figma designs** — no approximations.

- Use exact sizes, colors, spacing from Figma
- Verify using screenshots or MCP Figma tools
- Test all states (hover, focus, disabled, active)

Main Figma project: [shadcn_ui-PUBKY](https://www.figma.com/design/01ZvjSPZnKTNmaEWz0yJsq/shadcn_ui-PUBKY)

### 3. Atomic Design

```
atoms/     → Basic components (Button, Input, Avatar, Badge)
molecules/ → Atom combinations (InputField, SearchBar, PostCard)
organisms/ → Complex features (PostFeed, UserProfile, Forms)
templates/ → Page layouts
```

## File Structure

```
src/components/atoms/Button/
├── Button.tsx           # Main component
├── Button.test.tsx      # Unit + snapshot tests
└── Button.types.ts      # Type definitions
```

Do not add `index.ts` / `index.tsx` under `src/components` whose sole job is re-exporting from child folders. Component folders expose their symbols directly from concrete files (for example `Button/Button.tsx`, not `Button/index.ts` that only re-exports).

### Config and app routes

- **Config:** import from `@/config/<topic>` (concrete modules under `src/config/`, such as `@/config/nexus`, `@/config/posts`). Do not introduce an aggregate `src/config/index.ts` that re-exports the whole tree.
- **Routes:** import route constants and helpers from `@/app/routes` (implemented in `src/app/routes.ts`). Use named imports; use `import type` when you only need types from a colocated `*.types.ts` file.

#### Explore mode (unauthenticated browsing)

Guests can open routes that do not require a session:

| Kind           | Paths                                                           | `@/app/routes` helper  | `usePublicRoute()` flag |
| -------------- | --------------------------------------------------------------- | ---------------------- | ----------------------- |
| Core explore   | `/home`, `/hot`, `/search`                                      | `isCoreExploreRoute`   | `isCoreExploreRoute`    |
| Dynamic public | `/post/[userId]/[postId]`, `/profile/[pubky]`, `/invite/[code]` | `isDynamicPublicRoute` | `isDynamicPublicRoute`  |
| Either         | —                                                               | `isPublicExploreRoute` | `isPublicExploreRoute`  |

- **Route guard:** `EXPLORE_ROUTES` is included in `UNAUTHENTICATED_ROUTES`; dynamic public paths are allowed via `isDynamicPublicRoute()` in `RouteGuardProvider`.
- **UI chrome:** use `usePublicRoute()` for layout (e.g. explore header, mobile footer on `/home`). `isPublicRoute` on the hook result is a **legacy alias** for `isDynamicPublicRoute` only—it is `false` on `/home` even though the page is browsable.
- **Auth-gated actions:** use `useRequireAuth().requireAuth()` for post, reply, follow, filters, etc. Streams for guests should use `REACH.ALL` (see `useStreamIdFromFilters`, `useHotStreamId`).

## Component Template

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/libs/utils/utils';

const buttonVariants = cva('inline-flex items-center justify-center rounded-md text-sm font-medium', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-background hover:bg-accent',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    },
    size: {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-12 px-6',
      icon: 'h-10 w-10',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
```

## Imports and Exports

```tsx
// CORRECT
import { cn } from '@/libs/utils/utils';
import { Button } from '@/atoms/Button/Button';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';

// WRONG
import { cn } from 'src/lib/utils';
import { cn } from '../../libs/utils';
// Do not import components through folder indexes or aggregate modules.
```

Use the component namespace aliases from `tsconfig.json` for non-local component imports:

- `@/atoms/*`
- `@/molecules/*`
- `@/organisms/*`
- `@/templates/*`

Import from the file that defines the symbol, not from a folder, tier, or aggregate module. For sibling components in the same atomic tier or feature subtree, prefer local relative imports.

```tsx
// Same component folder
import type { ButtonProps } from './Button.types';

// Sibling molecule
import { ProgressSteps } from '../ProgressSteps/ProgressSteps';

// Cross-tier or app-level consumer
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
```

Route files that only render a template can re-export the template directly:

```tsx
export { Home as default } from '@/templates/Feed/Home/Home';
```

## Icons (Lucide and custom)

Icons are split on purpose: **stock Lucide** ships from the `lucide-react` package; **app-owned SVGs** (brands, bespoke marks, non-Lucide shapes) live in a single module behind the **`@/icons`** path alias (`src/libs/icons/icons.tsx`).

### Stock Lucide icons

```tsx
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
```

Use named imports from `lucide-react` only.

### Custom / brand icons

```tsx
import { MarkdownMark, UsersRound2 } from '@/icons';
```

The `@/icons` alias is defined in `tsconfig.json` and points at `src/libs/icons/icons.tsx`. Add new custom components there; keep them out of generic libs utility modules.

### URL → icon / label helpers

Helpers such as **`getIconFromUrl`** and **`getLabelFromUrl`** live in **`@/libs/utils/urlToIcon`** (`src/libs/utils/urlToIcon.ts`). They return Lucide component types or labels for link previews — import them from `@/libs/utils/urlToIcon`, not from `@/icons`.

### Tests

Component tests must use **real** `lucide-react` and `@/icons` implementations (no `vi.mock('lucide-react')` / `vi.mock('@/icons')` for icons). See `docs/component-testing.md` — _Icon components: Always Real_.

## Design System Integration

### Colors

```tsx
// Use design tokens
<div className="bg-primary text-primary-foreground" />
<div className="bg-muted text-muted-foreground" />

// Don't hardcode
<div style={{ backgroundColor: '#ffffff' }} />
<div className="bg-[#1a1a1a]" />
```

### Sizing

```tsx
// Follow Figma scale
<Avatar className="h-10 w-10" />  // 40px
<Avatar className="h-8 w-8" />    // 32px

// No arbitrary sizes
<Avatar className="h-[37px] w-[37px]" />
```

### Spacing

```tsx
// Use Tailwind spacing scale
<div className="p-4 gap-2 space-y-4" />

// No arbitrary spacing
<div className="p-[13px]" />
```

## Ref Forwarding

```tsx
// CORRECT — Forward refs
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <button ref={ref} {...props} />);

// WRONG — Missing forwardRef
const Button = (props: ButtonProps) => <button {...props} />;
```

## Figma Integration Workflow

### Available MCP Tools

- `get_metadata` — Component structure and metadata
- `get_code` — Generate UI code from Figma nodes
- `get_screenshot` — Visual comparison screenshots
- `get_variable_defs` — Design tokens and variables

### Workflow

1. Get metadata to understand component structure
2. Extract code for initial implementation
3. Compare screenshots for visual parity
4. Extract design tokens for consistent styling

## Migration Checklist

When migrating/creating a component:

- [ ] Shadcn equivalent checked
- [ ] Figma design analyzed
- [ ] Shadcn installed if available
- [ ] Placed at correct atomic level
- [ ] Utilities from concrete `@/libs/*` files (e.g. `cn` from `@/libs/utils/utils`); **icons** from `lucide-react` or `@/icons` per [Icons (Lucide and custom)](#icons-lucide-and-custom)
- [ ] Component imports point at concrete files (e.g. `@/atoms/Button/Button`), not aggregate folder indexes or re-export-only paths
- [ ] All Figma variants implemented
- [ ] CVA used for variant management
- [ ] Tests created (unit + snapshot) — see `docs/component-testing.md`
- [ ] Build passes (`npm run build`)
- [ ] Visual verification in browser

## Quick Checklist

When creating/modifying components:

- [ ] Shadcn checked first?
- [ ] File structure follows pattern?
- [ ] Using concrete `@/atoms/*`, `@/molecules/*`, `@/organisms/*`, or `@/templates/*` imports?
- [ ] Design tokens (not hardcoded colors)?
- [ ] Figma sizing/spacing matched?
- [ ] Tests created (unit + snapshot)?
- [ ] No re-export-only `index.ts` / `index.tsx` added under `src/components`?
- [ ] Build passes?
