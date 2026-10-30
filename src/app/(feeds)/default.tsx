import { notFound } from 'next/navigation';

// Next 16.4 strict route matching injects the @post catch-all into every route
// at this URL level, including siblings outside this route group. Each route then
// has to satisfy the (feeds) layout's children slot, so it needs an explicit
// default just like @post/default. Real routes always provide their own children
// page, so this only renders when nothing but the @post catch-all matched the URL.
// It must keep Next's built-in children default (a 404) rather than render an
// empty shell for unknown URLs.
// https://nextjs.org/docs/app/api-reference/file-conventions/default

export default function Default() {
  notFound();
}
