import { Eye, FileText } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

type PostAttachmentsGenericFilesProps = {
  genericFiles: AttachmentConstructed[];
  /** A tile for a file of any type, not only a PDF: a file shown on its own (`ResourceFileCard`). */
  allTypes?: boolean;
};
export const PostAttachmentsGenericFiles = ({ genericFiles, allTypes = false }: PostAttachmentsGenericFilesProps) => {
  const files = allTypes ? genericFiles : genericFiles.filter((f) => f.type === 'application/pdf');
  if (!files.length) return null;
  return (
    <Container className="gap-3">
      {files.map((file, i) => (
        <Container
          key={i}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="cursor-auto flex-row items-center justify-between gap-2 rounded-md bg-muted p-4"
        >
          <Container overrideDefaults className="flex items-center gap-x-2">
            <FileText className="size-6 shrink-0" />

            <Typography size="sm" className="font-bold break-all">
              {file.name}
            </Typography>
          </Container>

          <Button asChild variant="dark" size="icon" className="h-8 w-10 shrink-0 border-none bg-card hover:bg-card/70">
            <Link overrideDefaults href={file.urls.main} aria-label="Preview file">
              <Eye className="size-4" />
            </Link>
          </Button>
        </Container>
      ))}
    </Container>
  );
};
