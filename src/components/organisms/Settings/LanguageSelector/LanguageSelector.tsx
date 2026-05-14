'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { cn } from '@/libs/utils/utils';
import { LANGUAGES } from './LanguageSelector.constants';

function LanguageOptions({ currentLanguage, onSelect }: { currentLanguage: string; onSelect: (code: string) => void }) {
  return (
    <Container overrideDefaults className="flex flex-col">
      {LANGUAGES.map((lang) => {
        const isSelected = currentLanguage === lang.code;
        return (
          <Button
            key={lang.code}
            overrideDefaults
            onClick={() => onSelect(lang.code)}
            disabled={lang.disabled}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
              lang.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-accent',
              isSelected && 'bg-accent/50',
            )}
          >
            <Typography as="span" overrideDefaults className="text-2xl">
              {lang.flag}
            </Typography>
            <Typography as="span" overrideDefaults className="font-light">
              {lang.name}
            </Typography>
            {isSelected && <Check size={16} className="ml-auto" />}
          </Button>
        );
      })}
    </Container>
  );
}
export function LanguageSelector() {
  const t = useTranslations('language');
  const router = useRouter();
  const serverLocale = useLocale();
  const isMobile = useIsMobile();
  const { setLanguage } = useSettingsActions();
  const [isOpen, setIsOpen] = React.useState(false);
  const handleSelect = (code: string) => {
    if (code === serverLocale) {
      setIsOpen(false);
      return;
    }
    setLanguage(code);
    setIsOpen(false);
    router.refresh();
  };
  const selectedLang = LANGUAGES.find((lang) => lang.code === serverLocale) || LANGUAGES[0];
  const trigger = (
    <Button
      overrideDefaults
      className="flex h-8 w-full cursor-pointer items-center gap-1 transition-opacity hover:opacity-80"
    >
      <Typography as="span" overrideDefaults className="text-base">
        {selectedLang.flag}
      </Typography>
      <Typography as="span" overrideDefaults className="flex-1 text-left text-base leading-6 font-bold">
        {selectedLang.name}
      </Typography>
      <ChevronDown size={24} className={cn('shrink-0 transition-transform duration-300', isOpen && 'rotate-180')} />
    </Button>
  );
  return (
    <Container overrideDefaults className="flex w-full flex-col gap-4">
      <Typography
        as="label"
        overrideDefaults
        className="text-xs leading-4 font-medium tracking-[1.2px] text-muted-foreground uppercase"
      >
        {t('displayLanguage')}
      </Typography>

      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader className="mb-4">
              <SheetTitle>{t('selectLanguage')}</SheetTitle>
            </SheetHeader>
            <LanguageOptions currentLanguage={serverLocale} onSelect={handleSelect} />
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-(--radix-popover-trigger-width) rounded-md border border-border bg-card p-0 py-2 shadow-lg"
          >
            <LanguageOptions currentLanguage={serverLocale} onSelect={handleSelect} />
          </PopoverContent>
        </Popover>
      )}
    </Container>
  );
}
