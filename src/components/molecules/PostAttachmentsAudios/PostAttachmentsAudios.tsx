import { Audio } from '@/atoms/Audio/Audio';
import { Container } from '@/atoms/Container/Container';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

type PostAttachmentsAudiosProps = {
  audios: AttachmentConstructed[];
};

export const PostAttachmentsAudios = ({ audios }: PostAttachmentsAudiosProps) => {
  return (
    <Container className="gap-3">
      {audios.map((a, i) => (
        <Audio
          key={i}
          onClick={(e) => {
            e.stopPropagation();
          }}
          src={a.urls.main}
          className="cursor-auto"
        />
      ))}
    </Container>
  );
};
