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
├── Button.types.ts      # Type definitions
└── index.ts             # Exports
```

## Component Template

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/libs';

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
import { cn } from '@/libs';
import { Button } from '@/components/atoms';

// WRONG
import { cn } from 'src/lib/utils';
import { cn } from '../../libs/utils';
```

```tsx
// src/components/atoms/index.ts
export * from './Button';
export * from './Input';
export * from './Avatar';
```

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
- [ ] Imports using `@/libs`
- [ ] All Figma variants implemented
- [ ] CVA used for variant management
- [ ] Tests created (unit + snapshot) — see `docs/component-testing.md`
- [ ] Exports updated in `atoms/index.ts`
- [ ] Build passes (`npm run build`)
- [ ] Visual verification in browser

## Quick Checklist

When creating/modifying components:

- [ ] Shadcn checked first?
- [ ] File structure follows pattern?
- [ ] Using `@/` import aliases?
- [ ] Design tokens (not hardcoded colors)?
- [ ] Figma sizing/spacing matched?
- [ ] Tests created (unit + snapshot)?
- [ ] Exported in index.ts?
- [ ] Build passes?
