import type { Drink } from '@oct/shared';
import { deleteDrink, useDb } from '../../data/DataContext';
import { useT } from '../../i18n';
import { useToast } from '../../ui/Toast/Toast';
import { useUndoDelete } from '../diary/undoDelete';

/** Deletes an own drink with «Undo»: its id and row place stay until the window ends. */
export function useDeleteDrink() {
  const { t } = useT();
  const db = useDb();
  const toast = useToast();
  const { hide } = useUndoDelete();
  return (d: Drink) =>
    hide(`custom:${d.id}`, t('drink_list.deleted', { name: d.name }), () =>
      // The undo window swallows errors: say so, the drink is back after a reload.
      deleteDrink(db, d.id).catch(() =>
        toast({ text: t('drink_list.delete_error') }),
      ),
    );
}
