import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  aiTestRunSchema,
  aiTestRunSummarySchema,
  type AiTestRun,
  type AiTestRunSummary,
} from '@oct/shared';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { ModelCompare as Table } from '../../ui/ModelCompare/ModelCompare';
import { useToast } from '../../ui/Toast/Toast';
import { codeOf } from './aiDraft';
import { TESTS_PATH, useCopyRun } from './ModelTest';

type Props = {
  /** Bumped when a run finishes, so the new one shows without a reload. */
  rev: number;
};

/** «Model comparison»: the last 20 runs from the server; hidden while there are none. */
export function ModelCompare({ rev }: Props) {
  const { t } = useT();
  const toast = useToast();
  const [runs, setRuns] = useState<AiTestRunSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  // A finished run never changes, so its photos are loaded once.
  const [details, setDetails] = useState<Record<number, AiTestRun>>({});
  const [confirm, setConfirm] = useState<AiTestRunSummary | 'all' | null>(null);
  const [copyOut, copySheet] = useCopyRun();

  const load = useCallback(
    () =>
      api(TESTS_PATH, z.array(aiTestRunSummarySchema))
        // The running one is shown by «Model test».
        .then((list) => setRuns(list.filter((r) => r.status !== 'running')))
        .catch(() => {}),
    [],
  );
  useEffect(() => void load(), [load, rev]);

  const fail = (err: unknown) => toast({ text: t(`errors.${codeOf(err)}`) });

  async function detail(id: number) {
    const known = details[id];
    if (known) return known;
    const run = await api(`${TESTS_PATH}/${id}`, aiTestRunSchema);
    setDetails((d) => ({ ...d, [id]: run }));
    return run;
  }

  function toggle(id: number) {
    const open = openId === id ? null : id;
    setOpenId(open);
    if (open !== null) detail(open).catch(fail);
  }

  async function copy(id: number, kind: 'row' | 'report') {
    try {
      await copyOut(await detail(id), kind);
    } catch (err) {
      fail(err);
    }
  }

  async function remove() {
    const target = confirm;
    setConfirm(null);
    try {
      await api(
        target === 'all' ? TESTS_PATH : `${TESTS_PATH}/${target?.id}`,
        z.unknown(),
        { method: 'DELETE' },
      );
    } catch (err) {
      fail(err);
    }
    // Also after a failure: another window may have changed the list.
    await load();
  }

  if (!runs.length) return null;
  return (
    <>
      <Table
        runs={runs}
        openId={openId}
        openRun={openId === null ? null : (details[openId] ?? null)}
        onToggle={toggle}
        onCopy={(id, kind) => void copy(id, kind)}
        onDelete={(id) => setConfirm(runs.find((r) => r.id === id) ?? null)}
        onClear={() => setConfirm('all')}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={t(
          confirm === 'all'
            ? 'ai.compare.clear_title'
            : 'ai.compare.delete_title',
        )}
        body={
          confirm === 'all'
            ? t('ai.compare.clear_body')
            : t('ai.compare.delete_body', { model: confirm?.model ?? '' })
        }
        confirmLabel={t(
          confirm === 'all' ? 'ai.compare.clear' : 'ai.compare.delete',
        )}
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(null)}
      />
      {copySheet}
    </>
  );
}
