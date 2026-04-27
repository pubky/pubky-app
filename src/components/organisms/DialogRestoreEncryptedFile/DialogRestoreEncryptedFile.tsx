'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { FileUp, FileText, Loader2, RotateCcw } from 'lucide-react';
import { AppError } from '@/libs/error/error';
import { ErrorService } from '@/libs/error/error.types';
import { formatFileName } from '@/libs/utils/utils';
export function DialogRestoreEncryptedFile({ onRestore }: { onRestore: () => void }) {
  const t = useTranslations('onboarding.signIn');
  const tRestore = useTranslations('onboarding.signIn.restoreEncryptedFile');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.pkarr')) {
        setError(tRestore('invalidFileType'));
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };
  const handleRestore = async () => {
    // Guard against double-submit race condition
    if (isRestoring) return;
    if (!selectedFile || !password) {
      setError(tRestore('missingFields'));
      return;
    }
    setIsRestoring(true);
    setError('');
    try {
      await Core.AuthController.loginWithEncryptedFile({
        encryptedFile: selectedFile,
        password,
      });
      onRestore?.();
    } catch (error) {
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (
          errorMessage.includes('password') ||
          errorMessage.includes('decrypt') ||
          errorMessage.includes('invalid') ||
          errorMessage.includes('aead') ||
          errorMessage.includes('authentication') ||
          errorMessage.includes('cipher')
        ) {
          setError(tRestore('invalidPassword'));
        } else if (error instanceof AppError && error.service === ErrorService.Nexus) {
          setError(tRestore('nexusError'));
        } else {
          setError(tRestore('restoreError'));
        }
      } else if (typeof error === 'string' && error.toLowerCase().includes('aead')) {
        setError(tRestore('invalidPassword'));
      } else {
        setError(tRestore('unexpectedError'));
      }
      setIsRestoring(false);
    }
  };
  const handleReset = () => {
    setSelectedFile(null);
    setPassword('');
    setError('');
    setIsRestoring(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const isFormValid = () => {
    return Boolean(selectedFile && password && !isRestoring);
  };
  const handleKeyDown = Hooks.useEnterSubmit(isFormValid, handleRestore);
  const selectedFileDisplayName = selectedFile ? formatFileName(selectedFile.name) : 'encryptedfile.pkarr';
  return (
    <Atoms.Dialog>
      <Atoms.DialogTrigger asChild>
        <Atoms.Button
          id="restore-encrypted-file-btn"
          variant="outline"
          className="w-full rounded-full sm:w-auto md:flex-none"
        >
          <FileUp className="mr-2 h-4 w-4" />
          <span>{t('useEncryptedFile')}</span>
        </Atoms.Button>
      </Atoms.DialogTrigger>
      <Atoms.DialogContent className="max-w-full gap-6 overflow-hidden p-8" hiddenTitle={tRestore('title')}>
        <Atoms.DialogHeader className="space-y-1.5 pr-6">
          <Atoms.DialogTitle className="text-2xl leading-8 font-bold sm:text-xl sm:leading-7">
            {tRestore('title')}
          </Atoms.DialogTitle>
          <Atoms.DialogDescription className="text-sm leading-5">{tRestore('description')}</Atoms.DialogDescription>
        </Atoms.DialogHeader>

        <Atoms.Container className="gap-6">
          {/* File Upload Section */}
          <Atoms.Container className="space-y-2">
            <Atoms.Label className="text-xs font-medium tracking-widest text-muted-foreground">
              {tRestore('uploadLabel')}
            </Atoms.Label>

            <Atoms.Container
              className="relative flex w-full cursor-pointer flex-row items-center justify-between gap-3 overflow-hidden rounded-lg border-2 border-dashed border-border px-4 py-3 transition-colors hover:bg-card/80"
              onClick={handleFileSelect}
            >
              <span
                className={`block min-w-0 flex-1 truncate font-medium ${selectedFile?.name ? 'text-foreground' : 'text-muted-foreground'}`}
                title={selectedFile ? selectedFile.name : undefined}
              >
                {selectedFileDisplayName}
              </span>

              <Atoms.Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFileSelect();
                }}
              >
                <FileText className="h-4 w-4" />
                {tRestore('selectFile')}
              </Atoms.Button>
            </Atoms.Container>

            <input
              id="encrypted-file-input"
              ref={fileInputRef}
              type="file"
              accept=".pkarr"
              onChange={handleFileChange}
              className="hidden"
              aria-label={tRestore('selectFile')}
            />
          </Atoms.Container>

          {/* Password Section */}
          <Atoms.Container className="space-y-2">
            <Atoms.Label
              htmlFor="restore-password"
              className="text-xs font-medium tracking-widest text-muted-foreground"
            >
              {tRestore('passwordLabel')}
            </Atoms.Label>
            <Atoms.Input
              id="restore-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-opacity-90 h-14 rounded-md border border-dashed p-4 shadow-sm"
              placeholder={tRestore('passwordPlaceholder')}
              autoComplete="current-password"
              disabled={isRestoring}
            />
          </Atoms.Container>

          {/* Error Message */}
          {error && (
            <Atoms.Container className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <Atoms.Typography size="sm" className="text-xs font-medium text-destructive">
                {error}
              </Atoms.Typography>
            </Atoms.Container>
          )}
        </Atoms.Container>

        {/* Action Buttons */}
        <Atoms.DialogFooter>
          <Atoms.DialogClose asChild>
            <Atoms.Button
              variant="outline"
              size="lg"
              className="order-2 sm:order-1"
              onClick={handleReset}
              disabled={isRestoring}
            >
              {tRestore('cancel')}
            </Atoms.Button>
          </Atoms.DialogClose>
          <Atoms.Button
            id="encrypted-file-restore-btn"
            size="lg"
            className="order-1 sm:order-2"
            onClick={handleRestore}
            disabled={!isFormValid()}
          >
            {isRestoring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tRestore('restoring')}
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4 rotate-180" />
                {tRestore('restore')}
              </>
            )}
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
