import { Globe } from 'lucide-react';
import { LOCALES } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';

/** Switches to the next interface language, on screens before sign-in (OCT-244). */
export function LocaleToggle() {
  const { t, locale, setLocale } = useT();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]!;
  const name = new Intl.DisplayNames([next], { type: 'language' }).of(next);
  return (
    <Button
      variant="plain"
      small
      lang={next}
      // Starts with the visible code, so voice control finds it by what is shown.
      aria-label={t('setup.wizard.language', {
        code: next.toUpperCase(),
        lang: name ?? next,
      })}
      onClick={() => setLocale(next)}
    >
      <Globe aria-hidden="true" />
      {next.toUpperCase()}
    </Button>
  );
}
