import { mergeRegister } from '@lexical/utils';
import {
  activeEditor$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  createActiveEditorSubscription$,
  insertImage$,
  type LexicalVisitor,
  type MdastImportVisitor,
  realmPlugin,
} from '@mdxeditor/editor';
import { Action, Cell, map, mapTo, type Realm, Signal, withLatestFrom } from '@mdxeditor/gurx';
import {
  $getNodeByKey,
  COMMAND_PRIORITY_CRITICAL,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  type LexicalEditor,
  PASTE_COMMAND,
} from 'lexical';
import type * as Mdast from 'mdast';
import { ARTICLE_INLINE_NON_IMAGE_MIME_TYPES, ARTICLE_INLINE_SUPPORTED_MIME_TYPES } from '@/config/posts';
import {
  getInlineMediaKindFromMime,
  inferMediaKindFromUrl,
  type InlineNonImageMediaKind,
} from '@/libs/file/inlineMediaKind';
import { $insertInlineMediaNode, $isInlineMediaNode, InlineMediaNode } from './InlineMediaNode';
import type { InlineMediaDialogState, InlineMediaPluginParams, SaveInlineMediaParams } from './inlineMediaPlugin.types';

/**
 * MDXEditor plugin for non-image inline media (video, audio, PDF) in article bodies.
 *
 * Markdown knows one embed syntax, `![alt](src)`, and `imagePlugin` claims every such node. This
 * plugin registers an import visitor ahead of it that takes the nodes whose destination is a
 * non-image: a file URI the composer knows the MIME type of (uploaded this session, or an
 * attachment of the post being edited), or an external `https:` URL with a video/audio/PDF
 * extension. Everything else — images and unknown URIs — still goes to `imagePlugin`, untouched.
 * The export visitor writes a plain mdast `image` back, so the markdown is byte-identical to an
 * image's and `serializeArticleBody` maps every kind to an `attachment:{n}` slot the same way.
 *
 * It also owns drops and pastes that contain a non-image media file: `imagePlugin` only ever
 * uploads the `image/*` items of a payload and lets the rest fall through to Lexical, which swallows
 * them. A mixed drop is handled here as one batch (images included, so the insert stays
 * all-or-nothing against the upload budget); pure-image payloads are left to `imagePlugin`.
 */

export const inlineMediaUploadHandler$ = Cell<((file: File) => Promise<string>) | null>(null);
export const inlineMediaTypeResolver$ = Cell<(uri: string) => string | null>(() => null);
export const inlineMediaPreviewResolver$ = Cell<(uri: string) => string | null>(() => null);
export const inlineMediaDialogState$ = Cell<InlineMediaDialogState>({ type: 'inactive' });

export const openNewInlineMediaDialog$ = Signal<InlineNonImageMediaKind>((r) => {
  r.link(
    r.pipe(
      openNewInlineMediaDialog$,
      map((mediaKind): InlineMediaDialogState => ({ type: 'new', mediaKind })),
    ),
    inlineMediaDialogState$,
  );
});

export const openEditInlineMediaDialog$ = Signal<Omit<Extract<InlineMediaDialogState, { type: 'editing' }>, 'type'>>(
  (r) => {
    r.link(
      r.pipe(
        openEditInlineMediaDialog$,
        map((payload): InlineMediaDialogState => ({ type: 'editing', ...payload })),
      ),
      inlineMediaDialogState$,
    );
  },
);

export const closeInlineMediaDialog$ = Action((r) => {
  r.link(
    r.pipe(closeInlineMediaDialog$, mapTo<void, InlineMediaDialogState>({ type: 'inactive' })),
    inlineMediaDialogState$,
  );
});

/** Applies the dialog's values: edits the open node, or inserts a new one at the selection. */
export const saveInlineMedia$ = Signal<SaveInlineMediaParams>((r) => {
  r.sub(r.pipe(saveInlineMedia$, withLatestFrom(activeEditor$, inlineMediaDialogState$)), ([values, editor, state]) => {
    editor?.update(() => {
      if (state.type === 'editing') {
        const node = $getNodeByKey(state.nodeKey);
        if ($isInlineMediaNode(node)) {
          node.setSrc(values.src);
          node.setAltText(values.altText);
          node.setTitle(values.title ?? '');
        }
        return;
      }
      $insertInlineMediaNode({
        src: values.src,
        altText: values.altText,
        title: values.title,
        mediaKind: values.mediaKind,
      });
    });
    r.pub(inlineMediaDialogState$, { type: 'inactive' });
  });
});

function resolveMediaKind(realm: Realm, url: string): InlineNonImageMediaKind | null {
  if (url.startsWith('pubky://')) {
    const kind = getInlineMediaKindFromMime(realm.getValue(inlineMediaTypeResolver$)(url));
    return kind && kind !== 'image' ? kind : null;
  }
  return inferMediaKindFromUrl(url);
}

const hasNonImageMedia = (files: File[]) =>
  files.some((file) => ARTICLE_INLINE_NON_IMAGE_MIME_TYPES.includes(file.type));

function filesOf(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) return files;
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function dataTransferOf(event: Event): DataTransfer | null {
  if ('dataTransfer' in event) return (event as DragEvent).dataTransfer;
  if ('clipboardData' in event) return (event as ClipboardEvent).clipboardData;
  return null;
}

/**
 * Claims a drop or paste only when it carries at least one non-image media file; the whole
 * supported batch is then uploaded in one tick (the upload hook's budget sees it as one batch)
 * and inserted in order, images through `imagePlugin`'s own insert.
 */
function handleMediaPayload(realm: Realm, editor: LexicalEditor, event: Event): boolean {
  const files = filesOf(dataTransferOf(event));
  if (!hasNonImageMedia(files)) return false;
  const upload = realm.getValue(inlineMediaUploadHandler$);
  if (!upload) return false;

  event.preventDefault();
  const supported = files.filter((file) => ARTICLE_INLINE_SUPPORTED_MIME_TYPES.includes(file.type));
  Promise.all(supported.map((file) => upload(file).then((src) => ({ src, type: file.type }))))
    .then((uploads) => {
      for (const { src, type } of uploads) {
        const kind = getInlineMediaKindFromMime(type);
        if (!kind || kind === 'image') {
          realm.pub(insertImage$, { src, altText: '' });
          continue;
        }
        editor.update(() => {
          $insertInlineMediaNode({ src, mediaKind: kind });
        });
      }
    })
    .catch(() => {
      // The upload handler toasted the failure and tagged the rejection; nothing is inserted
    });
  return true;
}

export const inlineMediaPlugin = realmPlugin<InlineMediaPluginParams>({
  init(realm, params) {
    const importVisitor: MdastImportVisitor<Mdast.Image> = {
      testNode: (node) => node.type === 'image' && resolveMediaKind(realm, node.url) !== null,
      // Above imagePlugin's visitor (priority 0): the first visitor to claim an image node wins
      priority: 10,
      visitNode({ mdastNode, actions }) {
        const mediaKind = resolveMediaKind(realm, mdastNode.url);
        if (!mediaKind) return;
        actions.addAndStepInto($insertNode(mdastNode.url, mdastNode.alt ?? '', mdastNode.title ?? '', mediaKind));
      },
    };

    const exportVisitor: LexicalVisitor = {
      testLexicalNode: $isInlineMediaNode,
      visitLexicalNode({ mdastParent, lexicalNode, actions }) {
        const node = lexicalNode as InlineMediaNode;
        // Identical to imagePlugin's export: the published markdown never says which kind this is
        actions.appendToParent(mdastParent, {
          type: 'image',
          url: node.getSrc(),
          alt: node.getAltText(),
          title: node.getTitle(),
        });
      },
    };

    realm.pubIn({
      [addLexicalNode$]: InlineMediaNode,
      [addImportVisitor$]: importVisitor,
      [addExportVisitor$]: exportVisitor,
      [inlineMediaUploadHandler$]: params?.uploadHandler ?? null,
      [inlineMediaTypeResolver$]: params?.getMediaType ?? (() => null),
      [inlineMediaPreviewResolver$]: params?.getPreviewUrl ?? (() => null),
    });

    realm.pub(createActiveEditorSubscription$, (editor) =>
      mergeRegister(
        editor.registerCommand(
          DRAGOVER_COMMAND,
          (event) => {
            if (!hasNonImageMedia(filesOf(event.dataTransfer))) return false;
            event.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => handleMediaPayload(realm, editor, event),
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => handleMediaPayload(realm, editor, event),
          COMMAND_PRIORITY_CRITICAL,
        ),
      ),
    );
  },
  update(realm, params) {
    // The resolvers close over live composer state (session map, edit metadata): republish on
    // every render so an import after a type lands sees it
    realm.pubIn({
      [inlineMediaUploadHandler$]: params?.uploadHandler ?? null,
      [inlineMediaTypeResolver$]: params?.getMediaType ?? (() => null),
      [inlineMediaPreviewResolver$]: params?.getPreviewUrl ?? (() => null),
    });
  },
});

function $insertNode(src: string, altText: string, title: string, mediaKind: InlineNonImageMediaKind) {
  return new InlineMediaNode(src, altText, title, mediaKind);
}
