// Next 16.4 strict route matching injects the @post catch-all into every route
// at this URL level, including siblings outside this route group. Each route then
// has to satisfy the (feeds) layout's children slot, so it needs an explicit
// default just like @post/default. It never renders: real routes inside the
// group always provide their own children page.
// https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes#modals

export default function Default() {
  return null;
}
