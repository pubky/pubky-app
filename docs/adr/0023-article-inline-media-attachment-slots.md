# ADR 0023: Article Inline Media as Attachment Slots

## Status

Accepted — 2026-10-02

## Context

Articles (`kind: long`) embed media in their markdown body. PR #2437 introduced inline images with a contract that keeps the body host-agnostic: the composer writes `![alt](pubky://{author}/pub/pubky.app/files/{id})` after uploading at insert time, and publishing rewrites each destination to `![alt](attachment:{n})`, a slot of `post.attachments` (`[cover?, ...inline first-appearance, ...unreferenced originals]`, capped by the spec at 10). Slot 0 is the cover unless the body references `attachment:0`.

Users asked for inline video, audio and PDF. Markdown has no syntax for them, the body never carried a media type, and three places would have to agree on how a slot renders: the rich-text editor (MDXEditor), the markdown-mode textarea and the reader (`react-markdown`). The options were a typed syntax (remark directives such as `::video{src=…}`), a second grammar on links, or keeping image syntax and deciding the kind elsewhere.

## Decision

- **One syntax for every kind.** Images, videos, audio files and PDFs all use markdown image syntax. The published body is `![alt](attachment:{n})` whatever the kind; the composer body is the author's `pubky://…/files/{id}` URI. `serializeArticleBody`, `deserializeArticleBody`, the slot-0 cover rule and the controller contract are unchanged (`src/libs/post/articleInlineMedia.ts`).
- **The kind lives in file metadata, never in the body.** The reader types each slot from `file_details.content_type` (`useAttachmentsMetadata`, matched by `uri`, never by index), a same-session publish from the local files store entry, unlocked (paid) content from the bytes the reader holds, and an external `https:` URL from its file extension. Unknown stays an image, which keeps today's placeholder behaviour.
- **The ownership invariant is unchanged.** A slot renders only if `attachments[n]` is a file URI owned by the author; the cover remains image-only.
- **The editor keeps `imagePlugin` for images** and adds a plugin whose import visitor runs ahead of it, claiming only the image-syntax nodes whose file type the composer knows is not an image (session uploads, the edited post's attachments) or whose `https:` URL has a video/audio/PDF extension. The node exports back to a plain mdast `image`, so the markdown is byte-identical to an image's. An edit holds the editor behind its skeleton until the referenced attachments' metadata has settled, because the import runs once.
- **Caps follow post attachments.** Images keep `IMAGE_MAX_RAW_SIZE`; other kinds the spec's file size limit (`ATTACHMENT_MAX_OTHER_SIZE`). Locked articles keep the lock's own caps.

## Consequences

### Positive ✅

- No change to the persistence contract: articles published before this decision, and other clients that understand `attachment:{n}`, keep working.
- One rewrite pass covers every kind; the serialize-time validation (hand-typed refs, blob URIs, raw HTML, reference-style definitions, the cap) applies to all of them for free.
- The reader degrades safely: a slot whose type is unknown reserves space, then falls back to the image path.

### Negative ❌

- A reader must resolve file metadata before it can tell a video from an image; a cold page shows a skeleton until the rows land.
- Clients that render `![](attachment:n)` as `<img>` without consulting the file type show a broken image for a video. They already needed the attachment list to render anything.

### Neutral ⚠️

- External video/audio/PDF links are classified by extension only; a URL without one renders as an image placeholder.
- Media elements carry no referrer policy, so external sources use `preload="none"` and request nothing until the reader presses play.

## Alternatives Considered

### Alternative 1: remark directives (`::video{src=…}`)

Explicit semantics and a documented MDXEditor plugin. Rejected: enabling `directivesPlugin` re-parses existing article text such as `Note:this` as text directives (import errors or escaped output), the AST lib and the reader would each need a directive parser, and other clients would show the raw directive.

### Alternative 2: link syntax (`[label](attachment:n)`) for non-images

Degrades to a link in foreign renderers. Rejected: link nodes would have to join the slot ordering in the AST lib, the slot-0 rule would need a second node type, and the editor would still need a custom node.

### Alternative 3: CDN URLs or raw `pubky://` URIs in the published body

Rejected in ADR-era discussions of #2437 and unchanged here: host coupling, no ownership check, and a per-render URI parse.

## Implementation Notes

- Reader: `ArticleInlineMedia` routes to `ArticleInlineImage` (unchanged), the `Video`/`Audio` atoms or a PDF card; `PostArticleDetail` resolves the inline slots' rows; each player pauses itself once it leaves the viewport.
- Composer: `inlineMediaPlugin`, `InlineMediaNode`, `InlineMediaEditor`, `MarkdownEditorMediaDialog`; `useInlineMediaUpload` validates per kind; `usePostInput` types the edited post's inline attachments through `useAttachmentsMetadata`.
- Config: `ARTICLE_INLINE_SUPPORTED_MIME_TYPES` (images plus the spec's video, audio and PDF types); the cover list is untouched.

## Related Decisions

- [ADR-0001: Local-first writes](./0001-local-first-writes.md)
- [ADR-0022: Locks — creator-side locked content publishing](./0022-locks-creator-publishing.md) (unlocked articles render the same slots from local bytes)
