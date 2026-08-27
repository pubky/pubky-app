'use client';

import { useState } from 'react';
import { Link } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface DialogUnlockContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockTitle: string;
  onSubmit: (password: string) => void;
  loading?: boolean;
  error?: boolean;
}

const FIELD_LABEL_CLASS = 'text-xs font-medium tracking-widest text-muted-foreground uppercase';
const PASSWORD_FIELD_CLASS = 'h-14 rounded-md border border-input py-4 pr-5 pl-6 text-base shadow-xs';

export function DialogUnlockContent({
  open,
  onOpenChange,
  lockTitle,
  onSubmit,
  loading,
  error,
}: DialogUnlockContentProps) {
  const [password, setPassword] = useState('');

  const close = (next: boolean) => {
    if (!next) setPassword('');
    onOpenChange(next);
  };

  // TODO:[Locks] #2369 — password and `dev-static` all go away here.
  const handleSubmit = () => {
    if (!password || loading) return;
    onSubmit(password);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="w-full max-w-md rounded-xl border-x-0 border-y border-brand bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{'Password to Unlock'}</DialogTitle>
        </DialogHeader>

        <Container overrideDefaults className="flex items-center gap-2 rounded-md bg-muted p-6">
          <Link className="size-6 shrink-0 text-muted-foreground" aria-hidden />
          <Typography className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
            {lockTitle || 'Locked content'}
          </Typography>
        </Container>

        <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-2">
          <Label htmlFor="unlock-password" className={FIELD_LABEL_CLASS}>
            {'Password'}
          </Label>
          <Input
            id="unlock-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className={cn(PASSWORD_FIELD_CLASS, !password && 'border-dashed')}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            disabled={loading}
          />
          {error && (
            <Typography size="sm" className="text-destructive">
              {'Couldn\'t unlock this content. Please try again.'}
            </Typography>
          )}
        </form>

        <DialogFooter>
          <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={() => close(false)}>
            {'Cancel'}
          </Button>
          <Button
            variant={ButtonVariant.DEFAULT}
            size="lg"
            className="flex-1"
            onClick={handleSubmit}
            disabled={!password || loading}
          >
            {loading ? <Spinner size="sm" /> : 'View Content'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
