import { House, Server } from 'lucide-react';
import { AI_PROVIDERS, type AiConsentsResponse } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { List, ListRow } from '../List/List';

/** «google» → «Google Gemini»; «openai-compatible:host» → «host». */
export function consentName(providerKey: string) {
  const [id, host] = providerKey.split(/:(.*)/);
  const name = AI_PROVIDERS[id as keyof typeof AI_PROVIDERS]?.name;
  return name ?? (host || providerKey);
}

type Props = AiConsentsResponse & {
  onRevoke: (providerKey: string) => void;
};

/**
 * OCT-178 1.1, 1.9: the providers the user allowed, each with «Revoke»; a server's local model
 * needs no consent, so its row has no button (AC-C.6).
 */
export function ConsentsList({ consents, server, onRevoke }: Props) {
  const { t, locale } = useT();
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const local = server?.local ? server : null;
  return (
    <List
      title={t('ai_settings.consents')}
      footer={consents.length > 0 ? t('ai_settings.consents_note') : undefined}
    >
      {consents.map((c) => (
        <ListRow
          key={c.providerKey}
          icon={<Server />}
          description={t('ai_settings.via_server', {
            // The date never splits across lines.
            date: date.format(c.grantedAt).replaceAll(' ', '\u00a0'),
          })}
          value={
            <Button
              small
              variant="plain"
              // Several «Revoke» in one list: the name tells them apart.
              aria-label={`${t('ai_settings.revoke')} ${consentName(c.providerKey)}`}
              onClick={() => onRevoke(c.providerKey)}
            >
              {t('ai_settings.revoke')}
            </Button>
          }
        >
          {consentName(c.providerKey)}
        </ListRow>
      ))}
      {local && (
        <ListRow icon={<House />} description={t('ai_settings.local_sub')}>
          {t('ai_settings.local', { host: local.host ?? '' })}
        </ListRow>
      )}
      {consents.length === 0 && !local && (
        <ListRow>{t('ai_settings.consents_empty')}</ListRow>
      )}
    </List>
  );
}
