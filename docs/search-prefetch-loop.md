# Search prefetch loop (#2755)

`MobileFooter` keeps Search prefetch disabled regardless of the active route to work around
[issue #2755](https://github.com/pubky/pubky-app/issues/2755). The defect was isolated with Next.js 16.3.6 and React 19.2.8.
This document preserves the minimal reproduction and the navigation checks needed before removing the workaround.

## Minimal framework reproduction

In an empty directory outside the app checkout, create this `package.json` and the four route files below:

```json
{
  "private": true,
  "scripts": { "build": "next build --webpack", "start": "next start" },
  "dependencies": { "next": "16.3.6", "react": "19.2.8", "react-dom": "19.2.8" }
}
```

`app/layout.jsx`:

```jsx
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search prefetch reproduction' };

export default function Layout({ children, post }) {
  return (
    <html>
      <body>
        {children}
        {post}
      </body>
    </html>
  );
}
```

`app/search/page.jsx`:

```jsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Search() {
  const params = useSearchParams();
  return (
    <Link href="/search" prefetch={params.get('prefetch') === 'false' ? false : undefined}>
      Search
    </Link>
  );
}
```

Both `app/@post/default.jsx` and `app/@post/[...catchAll]/page.jsx`:

```jsx
export default function EmptySlot() {
  return null;
}
```

Run `npm install`, `npm run build`, then `npm start` using Node 24. In a fresh browser context, open
`http://localhost:3000/search?x=1` and watch the Network panel without clicking anything. With the affected version,
`/search?_rsc=...` repeats; the requests carry `next-router-prefetch: 1` and a router state tree ending in
`"metadata-only"`. The response's cache key includes the catch-all value `search`, but the optimistic prediction's key
omits it, so each response leaves the predicted entry unfulfilled.

Controls, each in a fresh context:

- `/search` without query params settles instead of looping.
- `/search?x=1&prefetch=false` makes no Search prefetch requests.
- Removing `app/@post` and the `post` slot from the layout makes `/search?x=1` settle instead of looping.

## Pubky verification and Next.js upgrades

Use `npm run build` and `npm start` with the production runtime configuration described in
[environment.md](environment.md). `next dev` does not exercise automatic prefetching. Use a fresh signed-out mobile
context (390×844) for each path, keep the footer visible, and observe for at least 60 seconds after each action; the loop
can begin after a quiet 15–45 seconds.

| Path                                                     | Expected with the workaround                    |
| -------------------------------------------------------- | ----------------------------------------------- |
| Open `/search?tags=bitcoin` or `/search?q=usdt` and idle | No `/search?_rsc` prefetch requests             |
| From either query search, tap Home in the footer         | Home opens; no `/search?_rsc` prefetch requests |
| From tag search, open a post in the intercepted modal    | Post opens; no `/search?_rsc` prefetch requests |
| Tap active Search                                        | Query remains intact; page scrolls to the top   |
| Open Home and tap Search                                 | Search navigation still works                   |

For an upgrade, first rerun the minimal reproduction with the candidate Next.js version. Then temporarily remove the
Search-specific `prefetch={false}` condition in a local build and repeat the app paths above. Keep the active-feed
scroll behavior. A passing unit test or a quiet initial Search page alone does not establish that the framework defect
is fixed; the navigation paths must also settle without a repeated metadata request stream.
