import { ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { adminBlockSchema } from '@oct/shared';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { List, ListRow } from '../../ui/List/List';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { formatDate, useAdminList } from './useAdminList';
import './admin.css';

export const BLOCKS_API = '/api/admin/blocks';
export const blocksSchema = z.array(adminBlockSchema);

/** 4.6 Blocks (OCT-13 §7): «Unblock» needs no confirmation — a wrong unblock only reopens the guard. */
export function BlocksScreen() {
  const { t, locale } = useT();
  const { items, act, failed } = useAdminList(BLOCKS_API, blocksSchema);

  if (failed) return failed;
  if (!items) return null;
  if (items.length === 0)
    return <ScreenState icon={<ShieldCheck />} title={t('blocks.empty')} />;
  return (
    <div className="settings">
      <List footer={t('blocks.hint')}>
        {items.map((b) => {
          const device = b.device ?? t('blocks.whole_ip');
          return (
            <ListRow
              key={b.id}
              description={
                <>
                  {t('blocks.meta', {
                    ip: b.ip,
                    datetime: formatDate(locale, b.blockedAt, true),
                  })}
                  <br />
                  {t('blocks.attempts', { count: b.failCount })}
                  {b.lastEmail &&
                    ` · ${t('blocks.last_for', { email: b.lastEmail })}`}
                  <span className="admin-row__action">
                    <Button
                      small
                      variant="tonal"
                      aria-label={t('blocks.unblock_label', {
                        device,
                        ip: b.ip,
                      })}
                      onClick={() =>
                        void act(
                          () =>
                            api(`${BLOCKS_API}/${b.id}`, z.undefined(), {
                              method: 'DELETE',
                            }),
                          t('blocks.done'),
                        )
                      }
                    >
                      {t('blocks.unblock')}
                    </Button>
                  </span>
                </>
              }
            >
              {device}
            </ListRow>
          );
        })}
      </List>
    </div>
  );
}
