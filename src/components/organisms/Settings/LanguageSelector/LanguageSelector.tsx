'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { LANGUAGES } from './LanguageSelector.constants';

/**
 * Sets the locale cookie for server-side i18n.
 * Cookie is used by next-intl to determine the locale on the server.
 * Adds Secure flag for HTTPS environments to prevent cookie leakage.
 */
function setLocaleCookie(locale: string) {
  const encodedLocale = encodeURIComponent(locale);
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `locale=${encodedLocale};path=/;max-age=31536000;SameSite=Lax${secure}`;
}

function LanguageOptions({ currentLanguage, onSelect }: { currentLanguage: string; onSelect: (code: string) => void }) {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col">
      {LANGUAGES.map((lang) => {
        const isSelected = currentLanguage === lang.code;
        return (
          <Atoms.Button
            key={lang.code}
            overrideDefaults
            onClick={() => onSelect(lang.code)}
            disabled={lang.disabled}
            className={Libs.cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
              lang.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-accent',
              isSelected && 'bg-accent/50',
            )}
          >
            <Atoms.Typography as="span" overrideDefaults className="text-2xl">
              {lang.flag}
            </Atoms.Typography>
            <Atoms.Typography as="span" overrideDefaults className="font-light">
              {lang.name}
            </Atoms.Typography>
            {isSelected && <Libs.Check size={16} className="ml-auto" />}
          </Atoms.Button>
        );
      })}
    </Atoms.Container>
  );
}

export function LanguageSelector() {
  const t = useTranslations('language');
  const router = useRouter();
  // Use server locale as source of truth
  const serverLocale = useLocale();
  const { setLanguage } = Core.useSettingsStore();
  const isMobile = Hooks.useIsMobile();
  const [isOpen, setIsOpen] = React.useState(false);

  // Sync store with server locale on mount (one-way sync: server -> client)
  React.useEffect(() => {
    setLanguage(serverLocale);
  }, [serverLocale, setLanguage]);

  const handleSelect = (code: string) => {
    // Prevent same language click
    if (code === serverLocale) {
      setIsOpen(false);
      return;
    }

    // Set cookie and close dropdown
    setLocaleCookie(code);
    setLanguage(code);
    setIsOpen(false);

    // Refresh server components to pick up new locale
    router.refresh();
  };

  const selectedLang = LANGUAGES.find((lang) => lang.code === serverLocale) || LANGUAGES[0];

  const trigger = (
    <Atoms.Button
      overrideDefaults
      className="flex h-8 w-full cursor-pointer items-center gap-1 transition-opacity hover:opacity-80"
    >
      <Atoms.Typography as="span" overrideDefaults className="text-base">
        {selectedLang.flag}
      </Atoms.Typography>
      <Atoms.Typography as="span" overrideDefaults className="flex-1 text-left text-base leading-6 font-bold">
        {selectedLang.name}
      </Atoms.Typography>
      <Libs.ChevronDown
        size={24}
        className={Libs.cn('shrink-0 transition-transform duration-300', isOpen && 'rotate-180')}
      />
    </Atoms.Button>
  );

  return (
    <Atoms.Container overrideDefaults className="flex w-full flex-col gap-4">
      <Atoms.Typography
        as="label"
        overrideDefaults
        className="text-xs leading-4 font-medium tracking-[1.2px] text-muted-foreground uppercase"
      >
        {t('displayLanguage')}
      </Atoms.Typography>

      {isMobile ? (
        <Atoms.Sheet open={isOpen} onOpenChange={setIsOpen}>
          <Atoms.SheetTrigger asChild>{trigger}</Atoms.SheetTrigger>
          <Atoms.SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <Atoms.SheetHeader className="mb-4">
              <Atoms.SheetTitle>{t('selectLanguage')}</Atoms.SheetTitle>
            </Atoms.SheetHeader>
            <LanguageOptions currentLanguage={serverLocale} onSelect={handleSelect} />
          </Atoms.SheetContent>
        </Atoms.Sheet>
      ) : (
        <Atoms.Popover open={isOpen} onOpenChange={setIsOpen}>
          <Atoms.PopoverTrigger asChild>{trigger}</Atoms.PopoverTrigger>
          <Atoms.PopoverContent
            align="start"
            sideOffset={8}
            className="w-(--radix-popover-trigger-width) rounded-md border border-border bg-card p-0 py-2 shadow-lg"
          >
            <LanguageOptions currentLanguage={serverLocale} onSelect={handleSelect} />
          </Atoms.PopoverContent>
        </Atoms.Popover>
      )}
    </Atoms.Container>
  );
}
