import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  AI_PROVIDERS,
  aiTestRunSchema,
  aiTestRunSummarySchema,
  type AdminAiStatus,
  type AiProviderId,
  type AiTestRun,
} from '@oct/shared';
import { api, type ApiError } from '../../api/client';
import { useT } from '../../i18n';
import {
  AiSettingsForm,
  type AiDraftState,
} from '../../ui/AiSettingsForm/AiSettingsForm';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { copyText, CopySheet } from '../../ui/CopySheet/CopySheet';
import { ModelTestCard } from '../../ui/ModelTestCard/ModelTestCard';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import {
  AI_STATUS_PATH,
  codeOf,
  draftBody,
  draftOf,
  useModels,
} from './aiDraft';

const TESTS_PATH = `${AI_STATUS_PATH}/tests`;
export const POLL_MS = 2000;
export const MODELS_MD_URL =
  'https://github.com/mastekator/OpenCalorieTracker/blob/main/docs/MODELS.md';

type Props = {
  status: AdminAiStatus;
  /** The screen's form: a run tests it as it is, saved or not (OCT-248 §4). */
  draft: AiDraftState;
  dirty: boolean;
};

/** «Model test» block: starts a run on the server, follows it every 2 s, copies its MODELS.md row. */
export function ModelTest({ status, draft, dirty }: Props) {
  const { t } = useT();
  const toast = useToast();
  const [run, setRun] = useState<AiTestRun | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copy, setCopy] = useState<{ text: string; title: string } | null>(
    null,
  );
  // «Another model for the test» under .env: its draft and key live only while the sheet is open.
  const [other, setOther] = useState<AiDraftState | null>(null);
  const [replacing, setReplacing] = useState(false);
  const {
    models,
    load: loadModels,
    reset: resetModels,
  } = useModels(other ?? draftOf(null));
  const env = status.source === 'env';

  const show = useCallback(async (id: number) => {
    setRun(await api(`${TESTS_PATH}/${id}`, aiTestRunSchema));
  }, []);

  // The run going on, else the latest: closing the screen does not stop it (AC-2.5).
  useEffect(() => {
    api(TESTS_PATH, z.array(aiTestRunSummarySchema))
      .then((list) => {
        const latest = list.find((r) => r.status === 'running') ?? list[0];
        return latest && show(latest.id);
      })
      // Nothing to show is the idle block, not an error screen.
      .catch(() => {});
  }, [show]);

  // One timer at a time; it stops with the run or the screen.
  const runningId = run?.status === 'running' ? run.id : null;
  useEffect(() => {
    if (runningId === null) return;
    const timer = setTimeout(
      () => void show(runningId).catch(() => setRun((r) => r && { ...r })),
      POLL_MS,
    );
    return () => clearTimeout(timer);
  }, [runningId, run, show]);

  async function start() {
    const body = draftBody(other ?? draft);
    setConfirm(false);
    setStarting(true);
    try {
      const { id } = await api(TESTS_PATH, z.object({ id: z.number() }), {
        method: 'POST',
        body,
      });
      closeOther();
      await show(id);
    } catch (err) {
      const code = codeOf(err);
      const details = (err as ApiError).details as
        { id?: unknown; retryAfterSec?: unknown } | undefined;
      if (code === 'ai_test_running' && typeof details?.id === 'number') {
        // Started from another window: show its progress (OCT-248 4.6).
        closeOther();
        toast({ text: t('errors.ai_test_running') });
        await show(details.id).catch(() => {});
      } else if (code === 'too_many_attempts') {
        const sec =
          typeof details?.retryAfterSec === 'number'
            ? details.retryAfterSec
            : 60;
        toast({ text: t('ai.test.limit', { count: Math.ceil(sec / 60) }) });
      } else toast({ text: t(`errors.${code}`) });
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!run) return;
    try {
      await api(`${TESTS_PATH}/${run.id}/stop`, z.unknown(), {
        method: 'POST',
      });
      await show(run.id);
    } catch (err) {
      toast({ text: t(`errors.${codeOf(err)}`) });
    }
  }

  async function copyOut(kind: 'row' | 'report') {
    const text = kind === 'row' ? run?.modelsMdRow : run?.report;
    if (!text) return;
    if (await copyText(text))
      toast(
        kind === 'row'
          ? {
              text: t('ai.test.copied'),
              action: {
                label: t('ai.test.open'),
                onClick: () => window.open(MODELS_MD_URL, '_blank', 'noopener'),
              },
            }
          : { text: t('ai.test.copied_report') },
      );
    else
      setCopy({
        text,
        title: t(kind === 'row' ? 'ai.test.sheet_row' : 'ai.test.sheet_report'),
      });
  }

  function closeOther() {
    setOther(null);
    setReplacing(false);
    resetModels();
  }

  const providerName = (id: AiProviderId) =>
    AI_PROVIDERS[id].name ?? t('ai.compatible');
  const otherStatus = { ...status, source: null, savedInactive: false };

  return (
    <>
      <ModelTestCard
        run={run}
        target={`${providerName(draft.provider)} · ${draft.model.trim()}`}
        targetNote={
          env ? t('ai.test.current') : dirty ? t('ai.test.unsaved') : undefined
        }
        onTarget={env ? () => setOther(draftOf(status)) : undefined}
        disabled={!draft.model.trim()}
        starting={starting && !other}
        onStart={() => setConfirm(true)}
        onStop={() => void stop()}
        onCopy={(kind) => void copyOut(kind)}
      />
      <Sheet
        open={other !== null}
        onClose={closeOther}
        title={t('ai.test.other_model')}
        footer={
          <Button
            loading={starting}
            disabled={!other?.model.trim()}
            onClick={() => setConfirm(true)}
          >
            {t('ai.test.start')}
          </Button>
        }
      >
        {other && (
          <AiSettingsForm
            status={otherStatus}
            draft={other}
            onChange={(patch) => {
              setOther((d) => d && { ...d, ...patch });
              if (
                'provider' in patch ||
                'apiKey' in patch ||
                'baseUrl' in patch
              )
                resetModels();
            }}
            keyOpen={
              replacing ||
              other.provider !== status.provider ||
              !status.keySet ||
              !!other.baseUrl.trim()
            }
            onReplaceKey={() => setReplacing(true)}
            dirty={false}
            busy={null}
            failed={null}
            checked={null}
            conflict={false}
            onCheck={() => {}}
            onSave={() => {}}
            onSaveAnyway={() => {}}
            onReload={() => {}}
            models={models}
            onLoadModels={() => void loadModels(other)}
            actions={false}
          />
        )}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        stack
        title={t('ai.test.confirm_title')}
        body={t('ai.test.confirm_body')}
        confirmLabel={t('ai.test.run')}
        tone="primary"
        onConfirm={() => void start()}
        onCancel={() => setConfirm(false)}
      />
      <CopySheet
        text={copy?.text ?? null}
        title={copy?.title ?? ''}
        onClose={() => setCopy(null)}
      />
    </>
  );
}
