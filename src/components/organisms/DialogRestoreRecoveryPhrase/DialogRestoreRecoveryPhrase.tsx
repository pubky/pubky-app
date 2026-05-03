'use client';

import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { useToast } from '@/molecules/Toaster/use-toast';
import { WordSlot } from '@/molecules/WordSlot/WordSlot';

import { FileText, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { AuthController } from '@/controllers/auth/auth';
interface DialogRestoreRecoveryPhraseProps {
  onRestore?: () => void;
}
export function DialogRestoreRecoveryPhrase({ onRestore }: DialogRestoreRecoveryPhraseProps) {
  const t = useTranslations('onboarding.signIn');
  const [userWords, setUserWords] = useState<string[]>(Array(12).fill(''));
  const [isRestoring, setIsRestoring] = useState(false);
  const [errors, setErrors] = useState<boolean[]>(Array(12).fill(false));
  const [touched, setTouched] = useState<boolean[]>(Array(12).fill(false));
  const { toast } = useToast();
  const handleRestore = async () => {
    // Guard against double-submit race condition
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      // Mark all fields as touched when trying to restore
      setTouched(Array(12).fill(true));

      // Basic validation
      const newErrors = userWords.map((word) => {
        return word === '' || !/^[a-z]+$/.test(word);
      });
      setErrors(newErrors);
      const hasErrors = newErrors.some((error) => error);
      const allFilled = userWords.every((word) => word !== '');
      const mnemonic = userWords.join(' ');
      await AuthController.loginWithMnemonic({
        mnemonic,
      });
      if (!hasErrors && allFilled) {
        onRestore?.();
      }
    } catch {
      // TODO: handle error based on the error type
      // show error toast
      toast({
        title: t('restoreRecoveryPhrase.errorTitle'),
        description: t('restoreRecoveryPhrase.errorDescription'),
      });
      setIsRestoring(false);
    }
  };
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setUserWords(Array(12).fill(''));
      setErrors(Array(12).fill(false));
      setTouched(Array(12).fill(false));
      setIsRestoring(false);
    }
  };
  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          id="restore-recovery-phrase-btn"
          variant="outline"
          className="w-full rounded-full sm:w-auto md:flex-none"
        >
          <FileText className="mr-2 h-4 w-4" />
          {t('useRecoveryPhrase')}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-6 p-8" hiddenTitle={t('restoreRecoveryPhrase.title')}>
        <RestoreForm
          userWords={userWords}
          errors={errors}
          touched={touched}
          isRestoring={isRestoring}
          onWordChange={setUserWords}
          onErrorsChange={setErrors}
          onTouchedChange={setTouched}
          onRestore={handleRestore}
        />
      </DialogContent>
    </Dialog>
  );
}
function RestoreForm({
  userWords,
  errors,
  touched,
  isRestoring,
  onWordChange,
  onErrorsChange,
  onTouchedChange,
  onRestore,
}: {
  userWords: string[];
  errors: boolean[];
  touched: boolean[];
  isRestoring: boolean;
  onWordChange: (words: string[]) => void;
  onErrorsChange: (errors: boolean[]) => void;
  onTouchedChange: (touched: boolean[]) => void;
  onRestore: () => void;
}) {
  const t = useTranslations('onboarding.signIn.restoreRecoveryPhrase');
  const handleWordChange = useCallback(
    (index: number, value: string) => {
      // Check if the value contains multiple words (e.g. pasted from clipboard or inserted from Android keyboard suggestions)
      // Split by common delimiters: spaces, newlines, tabs, commas
      const words = value
        .split(/[\s\n\t,]+/)
        .map((word) => word.toLowerCase().trim())
        .filter((word) => word !== '');

      // If multiple words detected, distribute them across fields
      if (words.length > 1) {
        const newUserWords = [...userWords];
        const newTouched = [...touched];
        const newErrors = [...errors];
        words.forEach((word, offset) => {
          const targetIndex = index + offset;
          if (targetIndex < 12) {
            newUserWords[targetIndex] = word;
            newTouched[targetIndex] = true;
            // Clear error when distributing words
            newErrors[targetIndex] = false;
          }
        });
        onWordChange(newUserWords);
        onTouchedChange(newTouched);
        onErrorsChange(newErrors);
        return;
      }

      // Handle single-word input
      const newUserWords = [...userWords];
      newUserWords[index] = value;
      onWordChange(newUserWords);

      // Mark field as touched
      if (!touched[index]) {
        const newTouched = [...touched];
        newTouched[index] = true;
        onTouchedChange(newTouched);
      }

      // Clear error when user starts typing
      if (errors[index] && value !== '') {
        const newErrors = [...errors];
        newErrors[index] = false;
        onErrorsChange(newErrors);
      }
    },
    [userWords, errors, touched, onWordChange, onErrorsChange, onTouchedChange],
  );
  const handleWordValidate = useCallback(
    (index: number, word: string) => {
      // Mark as touched when blurred
      if (!touched[index]) {
        const newTouched = [...touched];
        newTouched[index] = true;
        onTouchedChange(newTouched);
      }

      // Validate word format (basic validation)
      const newErrors = [...errors];
      newErrors[index] = word !== '' && !/^[a-z]+$/.test(word);
      onErrorsChange(newErrors);
    },
    [errors, touched, onErrorsChange, onTouchedChange],
  );
  const isFormValid = () => {
    const allWordsFilled = userWords.every((word) => word !== '');
    const noErrors = !errors.some((error) => error);
    const allTouched = touched.every((t) => t);
    return allWordsFilled && noErrors && allTouched && !isRestoring;
  };
  const handleKeyDown = useEnterSubmit(isFormValid, onRestore);
  return (
    <>
      <DialogHeader className="space-y-1.5 pr-6">
        <DialogTitle className="text-2xl font-bold sm:text-[24px]">{t('title')}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{t('description')}</DialogDescription>
      </DialogHeader>

      <Container className="space-y-6">
        <Container display="grid" className="grid-cols-2 gap-3 sm:grid-cols-3">
          {userWords.map((word, i) => {
            const isError = errors[i];
            const showError = touched[i];
            return (
              <WordSlot
                key={i}
                mode="editable"
                index={i}
                word={word}
                isError={isError}
                showError={showError}
                isRestoring={isRestoring}
                onChange={handleWordChange}
                onValidate={handleWordValidate}
                onKeyDown={handleKeyDown}
              />
            );
          })}
        </Container>

        {errors.some((error, index) => error && touched[index]) && (
          <Container className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{t('invalidWords')}</span>
            </div>
            <p className="mt-1 text-sm text-red-500/80">{t('invalidWordsHint')}</p>
          </Container>
        )}
      </Container>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="lg" className="order-2 sm:order-1">
            {t('cancel')}
          </Button>
        </DialogClose>
        <Button
          id="recovery-phrase-restore-btn"
          size="lg"
          className="order-1 sm:order-2"
          onClick={onRestore}
          disabled={!isFormValid()}
        >
          {isRestoring ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('restoring')}
            </>
          ) : (
            <>
              <RotateCcw className="mr-2 h-4 w-4 rotate-180" />
              {t('restore')}
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
