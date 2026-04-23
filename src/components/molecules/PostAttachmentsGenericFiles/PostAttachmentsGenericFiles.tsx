import * as Atoms from '@/atoms';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileText, Download } from 'lucide-react';
type PostAttachmentsGenericFilesProps = {
  genericFiles: AttachmentConstructed[];
};
export const PostAttachmentsGenericFiles = ({ genericFiles }: PostAttachmentsGenericFilesProps) => {
  const pdfs = genericFiles.filter((f) => f.type === 'application/pdf');
  if (!pdfs.length) return null;
  return (
    <Atoms.Container className="gap-3">
      {pdfs.map((pdf, i) => (
        <Atoms.Container
          key={i}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="cursor-auto flex-row items-center justify-between gap-2 rounded-md bg-muted p-4"
        >
          <Atoms.Container overrideDefaults className="flex items-center gap-x-2">
            <FileText className="size-6 shrink-0" />

            <Atoms.Typography size="sm" className="font-bold break-all">
              {pdf.name}
            </Atoms.Typography>
          </Atoms.Container>

          <Atoms.Button
            asChild
            variant="dark"
            size="icon"
            className="h-8 w-10 shrink-0 border-none bg-card hover:bg-card/70"
          >
            <Atoms.Link overrideDefaults href={pdf.urls.main}>
              <Download className="size-4" />
            </Atoms.Link>
          </Atoms.Button>
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
};
