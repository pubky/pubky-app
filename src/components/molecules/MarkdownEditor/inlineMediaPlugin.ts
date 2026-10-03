import { mergeRegister } from '@lexical/utils';
import {
  activeEditor$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  createActiveEditorSubscription$,
  imageUploadHandler$,
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
import {
  ARTICLE_INLINE_NON_IMAGE_MIME_TYPES,
  ARTICLE_INLINE_SUPPORTED_FILE_TYPES,
  ARTICLE_INLINE_SUPPORTED_MIME_TYPES,
} from '@/config/posts';
import { INLINE_MEDIA_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineMediaUpload/useInlineMediaUpload.types';
import {
  getInlineMediaKindFromMime,
  inferMediaKindFromUrl,
  type InlineNonImageMediaKind,
} from '@/libs/file/inlineMediaKind';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import {
  $createInlineMediaNode,
  $ensureInsertionSelection,
  $insertInlineMediaNode,
  $isInlineMediaNode,
  InlineMediaNode,
} from './InlineMediaNode';
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

/** The host's live resolvers, republished on every render; nothing in the UI subscribes to it directly. */
const inlineMediaParams$ = Cell<InlineMediaPluginParams | null>(null);
/**
 * Stable delegates onto `inlineMediaParams$`: the host rebuilds its resolvers every render, and a
 * cell that changed identity each time would re-render every mounted node and the dialog with it.
 */
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
      $insertInlineMediaNode(values);
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

/**
 * While a drag is over the editor the data store is in protected mode: `files` is empty and
 * `getAsFile()` returns null, so only the item types can say what is being dragged.
 */
const hasNonImageMediaItems = (dataTransfer: DataTransfer | null) =>
  Array.from(dataTransfer?.items ?? []).some(
    (item) => item.kind === 'file' && ARTICLE_INLINE_NON_IMAGE_MIME_TYPES.includes(item.type),
  );

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
  const upload = realm.getValue(imageUploadHandler$);
  if (!upload) return false;

  event.preventDefault();
  const supported = files.filter((file) => ARTICLE_INLINE_SUPPORTED_MIME_TYPES.includes(file.type));
  // The rest of the payload is claimed too, so it gets the composer's unsupported-type toast here
  if (supported.length < files.length) {
    toast({
      variant: 'error',
      description: `Unsupported file type. Supported: ${ARTICLE_INLINE_SUPPORTED_FILE_TYPES}.`,
    });
  }
  Promise.all(supported.map((file) => upload(file).then((src) => ({ src, type: file.type }))))
    .then((uploads) => {
      // The image insert is imagePlugin's and trusts the selection as it finds it
      editor.update(() => $ensureInsertionSelection());
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
    .catch((error: unknown) => {
      // A refused upload was already toasted and tagged by the upload handler; anything else is an
      // insert that failed after the upload succeeded, which the author must hear about
      if (error instanceof Error && error.name === INLINE_MEDIA_UPLOAD_REJECTION_NAME) return;
      Logger.error('[inlineMediaPlugin] Failed to insert dropped or pasted media', { error });
      toast({ variant: 'error', description: 'Could not insert the file. Try again.' });
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
        actions.addAndStepInto(
          $createInlineMediaNode({
            src: mdastNode.url,
            altText: mdastNode.alt ?? '',
            title: mdastNode.title ?? '',
            mediaKind,
          }),
        );
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
      [inlineMediaParams$]: params ?? null,
      [inlineMediaTypeResolver$]: (uri: string) => realm.getValue(inlineMediaParams$)?.getMediaType(uri) ?? null,
      [inlineMediaPreviewResolver$]: (uri: string) => realm.getValue(inlineMediaParams$)?.getPreviewUrl(uri) ?? null,
    });

    realm.pub(createActiveEditorSubscription$, (editor) =>
      mergeRegister(
        editor.registerCommand(
          DRAGOVER_COMMAND,
          (event) => {
            if (!hasNonImageMediaItems(event.dataTransfer)) return false;
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
    realm.pub(inlineMediaParams$, params ?? null);
  },
});
