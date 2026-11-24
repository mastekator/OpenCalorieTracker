import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Check, FileText, Lock, Upload } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Columns, DateOrder, ImportRecord, Mapping } from '@oct/shared';
import {
  commitImport,
  deleteImport,
  deleteInfo,
  getPreview,
  listImports,
  putMapping,
  uploadImport,
  type DeleteInfo,
  type DraftPreview,
  type ImportSource,
  type NeedsMapping,
  type PastImport,
} from '../../api/imports';
import { ApiError } from '../../api/client';
import { useDb, usePendingCount } from '../../data/DataContext';
import { flush } from '../../data/outbox';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { FormRow, formatDate } from '../../ui/FormList/FormList';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import { INTEGRATIONS_PATH } from './IntegrationsScreen';
import './settings.css';

/** ADR-0026 §5: the server refuses more with 413; checked here before the upload. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const FIELDS = [
  'date',
  'name',
  'kcal',
  'meal',
  'grams',
  'protein',
  'fat',
  'carbs',
  'time',
] as const satisfies readonly (keyof Columns)[];
const REQUIRED = new Set<keyof Columns>(['date', 'name', 'kcal']);
const ACCEPT: Record<ImportSource, string> = {
  oct: '.json,application/json',
  csv: '.csv,text/csv',
};

type Draft = { id: number; file: string; source: ImportSource };
type Step =
  | { name: 'source' }
  | { name: 'mapping'; draft: Draft; head: NeedsMapping }
  | { name: 'preview'; draft: Draft; preview: DraftPreview; all: boolean }
  | { name: 'done'; records: number };

/** The upload's error as the design words it (OCT-187 3.6). */
function uploadError(err: unknown, source: ImportSource) {
  if (!(err instanceof ApiError)) return 'errors.internal' as const;
  if (err.code === 'import_too_large') return 'integr.import.too_big' as const;
  if (err.code === 'already_imported') return 'integr.import.already' as const;
  if (err.code === 'validation_failed')
    return `integr.import.wrong_${source}` as const;
  return `errors.${err.code}` as const;
}

/** OCT-187 3.1–3.5, desktop 8.2: source → columns (CSV) → preview → commit. */
export function ImportScreen() {
  const { t } = useT();
  const online = useOnline();
  const db = useDb();
  const unsynced = (usePendingCount() ?? 0) > 0;
  const [step, setStep] = useState<Step>({ name: 'source' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [history, setHistory] = useState<PastImport[] | null>(null);
  const [asked, setAsked] = useState<{ id: number; info: DeleteInfo } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<number | null>(null);
  const toast = useToast();

  // Not cached: offline the list just isn't there (or stays as last loaded).
  const onSource = step.name === 'source';
  useEffect(() => {
    if (!online || !onSource) return;
    let live = true;
    listImports().then(
      (list) => live && setHistory(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [online, onSource]);

  async function run<T>(work: () => Promise<T>, onError = errorText) {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (err) {
      setError(onError(err));
    } finally {
      setBusy(false);
    }
  }
  function errorText(err: unknown) {
    return t(
      err instanceof ApiError ? `errors.${err.code}` : 'errors.internal',
    );
  }

  async function remove(id: number) {
    setAsked(null);
    setDeleting(id);
    try {
      await deleteImport(id);
      setHistory((list) => list && list.filter((i) => i.id !== id));
      toast({ text: t('integr.import.deleted') });
      // The pull at the end of a flush brings the tombstones: the meals leave the diary.
      void flush(db);
    } catch (err) {
      toast({ text: errorText(err) });
    } finally {
      setDeleting(null);
    }
  }

  async function upload(source: ImportSource, file: File) {
    if (file.size > MAX_IMPORT_BYTES)
      return setError(t('integr.import.too_big'));
    const draft = { id: 0, file: file.name, source };
    await run(
      async () => {
        const res = await uploadImport(source, file);
        draft.id = res.id;
        setStep(
          'needsMapping' in res
            ? { name: 'mapping', draft, head: res }
            : { name: 'preview', draft, preview: res, all: false },
        );
      },
      (err) => t(uploadError(err, source)),
    );
  }

  const cancel = () => {
    setError(null);
    setStep({ name: 'source' });
  };
  const banner = error && (
    <Banner tone="danger" title={t('integr.import.error_title')}>
      {error}
    </Banner>
  );

  if (step.name === 'mapping')
    return (
      <MappingStep
        draft={step.draft}
        head={step.head}
        busy={busy}
        online={online}
        banner={banner}
        onNext={(mapping) =>
          run(async () => {
            const preview = await putMapping(step.draft.id, mapping, false);
            if (preview.ambiguousDates && !mapping.dateOrder) return true;
            setStep({
              name: 'preview',
              draft: step.draft,
              preview,
              all: false,
            });
          })
        }
        onCancel={cancel}
      />
    );
  if (step.name === 'preview')
    return (
      <PreviewStep
        draft={step.draft}
        preview={step.preview}
        all={step.all}
        unsynced={unsynced}
        busy={busy}
        committing={committing}
        online={online}
        banner={banner}
        onInclude={(all) => {
          setStep({ ...step, all });
          void run(async () => {
            const preview = await getPreview(step.draft.id, all);
            setStep((s) => (s.name === 'preview' ? { ...s, preview } : s));
          });
        }}
        onCommit={() => {
          setCommitting(true);
          void run(async () => {
            const { records } = await commitImport(step.draft.id, step.all);
            // The imported meals come down with the pull at the end of a flush.
            void flush(db);
            setStep({ name: 'done', records });
          }).finally(() => setCommitting(false));
        }}
        onCancel={cancel}
      />
    );
  if (step.name === 'done') return <DoneStep records={step.records} />;
  return (
    <>
      <SourceStep
        online={online}
        busy={busy}
        banner={banner}
        history={history}
        deleting={deleting}
        onFile={upload}
        onWrongFile={() => setError(t('integr.import.wrong_type'))}
        onDelete={(id) =>
          void run(async () => setAsked({ id, info: await deleteInfo(id) }))
        }
      />
      <DeleteImportDialog
        info={asked?.info ?? null}
        onConfirm={() => asked && void remove(asked.id)}
        onCancel={() => setAsked(null)}
      />
    </>
  );
}

/** OCT-187 3.7: what «Delete import» takes away, edited meals included. */
export function DeleteImportDialog({
  info,
  onConfirm,
  onCancel,
}: {
  info: DeleteInfo | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, num } = useT();
  const count = (n: number) => ({ count: n, n: num(n) });
  return (
    <ConfirmDialog
      open={!!info}
      title={t('integr.import.delete_title')}
      body={
        info &&
        // The body is one <p>: the two sentences go as one text.
        [
          t('integr.import.delete_body', {
            entries: t('integr.import.records', count(info.records)),
            days: t('integr.import.n_days', count(info.days)),
          }),
          info.edited > 0 &&
            t('integr.import.delete_edited', count(info.edited)),
        ]
          .filter(Boolean)
          .join(' ')
      }
      confirmLabel={t('integr.import.delete')}
      tone="danger"
      stack
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

type SourceProps = {
  online: boolean;
  busy: boolean;
  banner: ReactNode;
  /** Committed imports; null until loaded (and offline, as it isn't cached). */
  history?: PastImport[] | null;
  /** The import whose DELETE is in flight. */
  deleting?: number | null;
  onFile: (source: ImportSource, file: File) => void;
  onWrongFile: () => void;
  onDelete?: (id: number) => void;
};

export function SourceStep({
  online,
  busy,
  banner,
  history = null,
  deleting = null,
  onFile,
  onWrongFile,
  onDelete,
}: SourceProps) {
  const { t, num, locale } = useT();
  // 3.1: "9 Nov, 21:14"; the year only when it is not this one.
  const when = (ms: number, time: boolean) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year:
        new Date(ms).getFullYear() === new Date().getFullYear()
          ? undefined
          : 'numeric',
      ...(time && { hour: '2-digit', minute: '2-digit' }),
    }).format(ms);
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ImportSource>('oct');
  const [over, setOver] = useState(false);
  const off = !online || busy;

  const pick = (s: ImportSource) => {
    if (off) return;
    setSource(s);
    // The accept list must be set before the picker opens.
    if (input.current) input.current.accept = ACCEPT[s];
    input.current?.click();
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (!file || off) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'json') onFile('oct', file);
    else if (ext === 'csv') onFile('csv', file);
    else onWrongFile();
  };

  return (
    <div className="settings">
      {banner}
      <List
        title={t('integr.import.where')}
        footer={
          online ? t('integr.import.other_csv') : t('integr.import.need_net')
        }
      >
        <ListRow
          icon={<FileText />}
          description={t('integr.import.oct_desc')}
          disabled={off}
          onClick={() => pick('oct')}
        >
          {t('integr.import.oct')}
        </ListRow>
        {(['mfp', 'cronometer'] as const).map((s) => (
          <ListRow
            key={s}
            icon={<FileText />}
            description={t(`integr.import.${s}_desc`)}
            value={t('integr.import.soon')}
            chevron={false}
            disabled
          >
            {t(`integr.import.${s}`)}
          </ListRow>
        ))}
        <ListRow
          icon={<FileText />}
          description={t('integr.import.csv_desc')}
          disabled={off}
          onClick={() => pick('csv')}
        >
          {t('integr.import.csv')}
        </ListRow>
      </List>
      <div
        className={`import__drop${over ? ' import__drop--over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <Upload aria-hidden="true" />
        {t('integr.import.drop')}
      </div>
      <p className="import__note">{t('integr.import.limits')}</p>
      <p className="import__note">
        <Lock aria-hidden="true" />
        {t('integr.import.privacy')}
      </p>
      {history && (
        <List title={t('integr.import.history')}>
          {history.length === 0 && (
            <ListRow chevron={false}>{t('integr.import.no_history')}</ListRow>
          )}
          {history.map((i) => (
            <ListRow
              key={i.id}
              description={`${when(i.committedAt, true)} · ${t('integr.import.records', { count: i.records, n: num(i.records) })}`}
              chevron={false}
              action={
                <span className="import__delete">
                  <Button
                    variant="danger-plain"
                    small
                    disabled={off || deleting !== null}
                    loading={deleting === i.id}
                    aria-label={t('integr.import.delete_label', {
                      source: t(`integr.import.${i.source}`),
                      date: when(i.committedAt, false),
                    })}
                    onClick={() => onDelete?.(i.id)}
                  >
                    {deleting === i.id
                      ? t('integr.import.deleting')
                      : t('integr.import.delete')}
                  </Button>
                </span>
              }
            >
              {t(`integr.import.${i.source}`)}
            </ListRow>
          ))}
        </List>
      )}
      <input
        ref={input}
        type="file"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-testid="import-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(source, file);
        }}
      />
    </div>
  );
}

function FileLine({ draft }: { draft: Draft }) {
  const { t } = useT();
  return (
    <p className="import__file">
      <FileText aria-hidden="true" />
      {t(`integr.import.${draft.source}`)} · {draft.file}
    </p>
  );
}

type MappingProps = {
  draft: Draft;
  head: NeedsMapping;
  busy: boolean;
  online: boolean;
  banner: ReactNode;
  /** Resolves true when the server could not tell the date order: the question shows. */
  onNext: (mapping: Mapping) => Promise<boolean | void>;
  onCancel: () => void;
  /** Opens with the date-order question (stories). */
  askDate?: boolean;
};

export function MappingStep({
  draft,
  head,
  busy,
  online,
  banner,
  onNext,
  onCancel,
  askDate = false,
}: MappingProps) {
  const { t, locale } = useT();
  const [columns, setColumns] = useState<Partial<Columns>>(head.columns);
  const [decimal, setDecimal] = useState<Mapping['decimal']>();
  const [dateOrder, setDateOrder] = useState<DateOrder | null>(
    askDate ? 'dmy' : null,
  );
  const ready = [...REQUIRED].every((f) => columns[f] !== undefined);
  // Shown as picked: the user's choice, else a comma decimal in the sample, else a dot.
  const shownDecimal =
    decimal ??
    (head.sample.flat().some((c) => /^\d+,\d+$/.test(c.trim())) ? ',' : '.');
  const day = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(date));

  const next = async () => {
    const mapping: Mapping = {
      columns: columns as Columns,
      ...(decimal && { decimal }),
      ...(dateOrder && { dateOrder }),
    };
    if (await onNext(mapping)) setDateOrder('dmy');
  };

  return (
    <div className="settings">
      <FileLine draft={draft} />
      {banner}
      <p className="settings__lead">{t('integr.import.map_lead')}</p>
      <List>
        {FIELDS.map((field) => {
          const index = columns[field];
          const example =
            index === undefined ? undefined : head.sample[0]?.[index];
          const missing = REQUIRED.has(field) && index === undefined;
          return (
            <FormRow
              key={field}
              label={`${t(`integr.import.field.${field}`)}${REQUIRED.has(field) ? ' *' : ''}`}
              description={
                missing ? (
                  <span className="import__error">
                    {t(
                      field === 'kcal'
                        ? 'integr.import.need_kcal'
                        : 'integr.import.need_column',
                    )}
                  </span>
                ) : index === undefined ? (
                  t('integr.import.not_in_file')
                ) : (
                  t('integr.import.example', { value: example ?? '' })
                )
              }
            >
              <select
                className="import__select"
                value={index ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setColumns({
                    ...columns,
                    [field]: value === '' ? undefined : Number(value),
                  });
                }}
              >
                <option value="">—</option>
                {head.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </FormRow>
          );
        })}
      </List>
      <List>
        <FormRow label={t('integr.import.decimal')} stacked>
          <Segment
            label={t('integr.import.decimal')}
            options={[
              { value: '.', label: '1.5' },
              { value: ',', label: '1,5' },
            ]}
            value={shownDecimal}
            onChange={setDecimal}
          />
        </FormRow>
        {dateOrder && (
          <FormRow label={t('integr.import.date_q')} stacked>
            <Segment
              label={t('integr.import.date_q')}
              options={[
                { value: 'dmy', label: day('2024-04-03') },
                { value: 'mdy', label: day('2024-03-04') },
              ]}
              value={dateOrder}
              onChange={setDateOrder}
            />
          </FormRow>
        )}
      </List>
      <div className="import__actions">
        <Button variant="plain" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!ready || !online}
          loading={busy}
          onClick={() => void next()}
        >
          {t('integr.import.next')}
        </Button>
      </div>
    </div>
  );
}

type PreviewProps = {
  draft: Draft;
  preview: DraftPreview;
  /** «Import those days too» is on. */
  all: boolean;
  /** This device has unsent changes (E-3): a warning, not a block. */
  unsynced: boolean;
  busy: boolean;
  committing: boolean;
  online: boolean;
  banner: ReactNode;
  onInclude: (all: boolean) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function PreviewStep({
  draft,
  preview,
  all,
  unsynced,
  busy,
  committing,
  online,
  banner,
  onInclude,
  onCommit,
  onCancel,
}: PreviewProps) {
  const { t, num, locale } = useT();
  const [allBad, setAllBad] = useState(false);
  const { period, unrecognized } = preview;
  const bad = allBad ? unrecognized.rows : unrecognized.rows.slice(0, 3);
  const count = (n: number) => ({ count: n, n: num(n) });
  const row = (r: ImportRecord) =>
    `${formatDate(r.localDate, locale)} · ${t(`meal.type.${r.mealType}`)}`;

  return (
    <div className="settings">
      <section className="import__card">
        <FileLine draft={draft} />
        {period && (
          <b className="import__period">
            {formatDate(period.from, locale)} — {formatDate(period.to, locale)}
          </b>
        )}
        <div className="import__sum">
          <span>
            <b>{num(preview.days)}</b>
            {t('integr.import.days', count(preview.days))}
          </span>
          <span>
            <b>{num(preview.records)}</b>
            {t('integr.import.entries', count(preview.records))}
          </span>
        </div>
      </section>
      {banner}
      {unsynced && (
        <Banner tone="warning">{t('integr.import.unsynced')}</Banner>
      )}
      {(preview.skippedDays > 0 || all) && (
        <List>
          <ListRow
            description={
              preview.skippedDays > 0 &&
              t('integr.import.skipped', {
                days: num(preview.skippedDays),
                entries: num(preview.skippedRecords),
                count: preview.skippedRecords,
              })
            }
          >
            {t('integr.import.skip_days')}
          </ListRow>
          <ListRow
            description={t('integr.import.include_sub')}
            value={
              <Switch
                checked={all}
                label={t('integr.import.include')}
                disabled={busy || !online}
                onChange={onInclude}
              />
            }
          >
            {t('integr.import.include')}
          </ListRow>
        </List>
      )}
      {preview.first.length > 0 && (
        <div className="import__rows">
          <List title={t('integr.import.first')}>
            {preview.first.map((r, i) => (
              <ListRow
                key={i}
                description={row(r)}
                value={num(r.kcal)}
                chevron={false}
              >
                {r.grams
                  ? `${r.name} · ${num(r.grams)} ${t('macro.g')}`
                  : r.name}
              </ListRow>
            ))}
          </List>
        </div>
      )}
      {preview.first.length > 0 && (
        <section className="list import__first">
          <h2 className="list__title">{t('integr.import.first')}</h2>
          <table className="import__table">
            <thead>
              <tr>
                <th>{t('integr.import.col_when')}</th>
                <th>{t('integr.import.field.name')}</th>
                <th>{t('integr.import.field.grams')}</th>
                <th>{t('integr.import.field.kcal')}</th>
                <th>{t('integr.import.field.protein')}</th>
                <th>{t('integr.import.field.fat')}</th>
                <th>{t('integr.import.field.carbs')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.first.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className="import__when">
                      {formatDate(r.localDate, locale)}
                    </span>
                    {t(`meal.type.${r.mealType}`)}
                  </td>
                  <td>{r.name}</td>
                  <td>{r.grams ? num(r.grams) : '—'}</td>
                  <td>{num(r.kcal)}</td>
                  <td>{num(r.proteinG)}</td>
                  <td>{num(r.fatG)}</td>
                  <td>{num(r.carbsG)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {unrecognized.count > 0 && (
        <List title={t('integr.import.bad', count(unrecognized.count))}>
          {bad.map((r) => (
            <ListRow key={r.line}>
              {t('integr.import.bad_row', {
                line: num(r.line),
                reason: t(`integr.import.reason.${r.reason}`),
              })}
            </ListRow>
          ))}
          {!allBad && unrecognized.rows.length > bad.length && (
            <ListRow accent onClick={() => setAllBad(true)}>
              {t('integr.import.show_all')}
            </ListRow>
          )}
        </List>
      )}
      {preview.records === 0 && (
        <Banner tone="notice">
          {t(
            preview.skippedDays > 0
              ? 'integr.import.nothing'
              : 'integr.import.nothing_read',
          )}
        </Banner>
      )}
      <div className="import__actions">
        <Button variant="plain" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={preview.records === 0 || !online || busy}
          loading={committing}
          onClick={onCommit}
        >
          {committing
            ? t('integr.import.importing')
            : preview.records === 0
              ? t('integr.import.import_none')
              : t('integr.import.import', count(preview.records))}
        </Button>
      </div>
    </div>
  );
}

export function DoneStep({ records }: { records: number }) {
  const { t, num } = useT();
  const [, navigate] = useLocation();
  return (
    <ScreenState
      icon={<Check />}
      title={t('integr.import.done', { count: records, n: num(records) })}
      role="status"
      focusTitle
      details={<p>{t('integr.import.done_sub')}</p>}
      action={
        <>
          <Button onClick={() => navigate('/')}>
            {t('integr.import.open_diary')}
          </Button>
          <Button variant="plain" onClick={() => navigate(INTEGRATIONS_PATH)}>
            {t('integr.import.back')}
          </Button>
        </>
      }
    />
  );
}
