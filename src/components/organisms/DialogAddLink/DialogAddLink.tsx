'use client';

import { useState } from 'react';
import { Clipboard, Link } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { USER_LINK_LABEL_MAX_LENGTH, USER_LINK_URL_MAX_LENGTH } from '@/config/user';
import { safeExternalUrlSchema } from '@/libs/utils/safeExternalUrl';
import { copyToClipboard } from '@/libs/utils/utils';
import { InputField } from '@/molecules/InputField/InputField';

const labelSchema = z
  .string()
  .trim()
  .min(1, 'Label is required')
  .max(USER_LINK_LABEL_MAX_LENGTH, `Max ${USER_LINK_LABEL_MAX_LENGTH} characters`)
  .regex(/^[a-zA-Z0-9]+$/, 'Alphanumeric only');
const urlSchema = safeExternalUrlSchema.refine((url) => url.length <= USER_LINK_URL_MAX_LENGTH, {
  message: `Max ${USER_LINK_URL_MAX_LENGTH} characters`,
});
interface DialogAddLinkProps {
  onSave: (label: string, url: string) => void;
  disabled?: boolean;
}
export function DialogAddLink({ onSave, disabled = false }: DialogAddLinkProps) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const validateLabel = (value: string) => {
    const result = labelSchema.safeParse(value);
    setLabelError(result.success ? null : (result.error.issues[0]?.message ?? 'Invalid label'));
  };
  const validateUrl = (value: string) => {
    const result = urlSchema.safeParse(value);
    setUrlError(result.success ? null : (result.error.issues[0]?.message ?? 'Invalid URL'));
  };
  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    const isLabelValid = labelSchema.safeParse(trimmedLabel).success;
    const isUrlValid = urlSchema.safeParse(trimmedUrl).success;
    if (!isLabelValid) {
      validateLabel(trimmedLabel);
    }
    if (!isUrlValid) {
      validateUrl(trimmedUrl);
    }
    if (!isLabelValid || !isUrlValid) return;
    onSave(trimmedLabel, trimmedUrl);
    setLabel('');
    setUrl('');
    setLabelError(null);
    setUrlError(null);
  };
  const isValid =
    !labelError &&
    !urlError &&
    label.trim().length > 0 &&
    url.trim().length > 0 &&
    labelSchema.safeParse(label.trim()).success &&
    urlSchema.safeParse(url.trim()).success;
  if (disabled) {
    return null;
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-cy="edit-profile-add-link-btn" variant="secondary" size="sm" className="w-fit rounded-full">
          <Link className="h-4 w-4" />
          <span>{'Add link'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent avoidKeyboard className="w-xl max-w-xl" hiddenTitle={'Add link'}>
        <DialogHeader className="pr-6">
          <DialogTitle>{'Add link'}</DialogTitle>
        </DialogHeader>

        <Container className="gap-6">
          <Container className="gap-2">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground">{'LABEL'}</Label>
            <InputField
              dataCy="add-profile-link-label-input"
              placeholder={'Twitter'}
              variant="dashed"
              value={label}
              onChange={(e) => {
                const value = e.target.value;
                setLabel(value);
                validateLabel(value);
              }}
              size="lg"
              maxLength={USER_LINK_LABEL_MAX_LENGTH}
              status={labelError ? 'error' : 'default'}
              message={labelError ?? undefined}
              messageType={labelError ? 'error' : 'default'}
            />
          </Container>

          <Container className="gap-2">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground">{'URL'}</Label>
            <InputField
              dataCy="add-profile-link-url-input"
              placeholder={'https://twitter.com/satoshi'}
              variant="dashed"
              value={url}
              onChange={(e) => {
                const value = e.target.value;
                setUrl(value);
                validateUrl(value);
              }}
              size="lg"
              maxLength={USER_LINK_URL_MAX_LENGTH}
              icon={<Clipboard className="h-4 w-4" />}
              iconPosition="right"
              onClickIcon={async () => {
                try {
                  await copyToClipboard({
                    text: url,
                  });
                } catch {}
              }}
              status={urlError ? 'error' : 'default'}
              message={urlError ?? undefined}
              messageType={urlError ? 'error' : 'default'}
            />
          </Container>
        </Container>

        <DialogFooter className="flex-row gap-4">
          <DialogClose asChild>
            <Button
              variant="outline"
              size="lg"
              className="sm:size-default flex-1 rounded-full border border-border bg-background"
            >
              {'Cancel'}
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              data-cy="add-profile-link-submit-btn"
              size="lg"
              className="sm:size-default flex-1 rounded-full border-brand text-brand"
              onClick={handleSave}
              disabled={!isValid}
            >
              {'Save link'}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
