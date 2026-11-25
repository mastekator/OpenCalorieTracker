import { useEffect, useRef, useState } from 'react';
import type { ExportFormat, ExportSummary } from '@oct/shared';
import { downloadExport, exportSummary, saveFile } from '../../api/export';
import { ApiError } from '../../api/client';
import { useIntegrations } from '../../data/DataContext';
import { localToday } from '../diary/useToday';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { FormRow, InlineDate } from '../../ui/FormList/FormList';
import { List } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Segment } from '../../ui/Segment/Segment';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import './settings.css';

/** «12 Nov»: the hub card's last export, in the device's time zone. */
export const shortDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );

/** «~1.2 MB»: the unit comes from Intl, so no dictionary entry per size. */
function fileSize(bytes: number, locale: string) {
  const mb = bytes >= 1024 * 1024;
  return `~${new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: mb ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: mb ? 1 : 0,
  }).format(Math.max(1, bytes / (mb ? 1024 * 1024 : 1024)))}`;
}

/** The hub card's description: the last finished export, or what the screen does. */
export function useExportCard() {
  const { t, locale } = useT();
  const last = useIntegrations()?.export;
  return last?.lastAt && last.lastFormat
    ? t('integr.export.last', {
        date: shortDate(last.lastAt, locale),
        format: last.lastFormat.toUpperCase(),
      })
    : t('integr.export.desc');
}

/** OCT-187 §2: the diary as JSON or CSV, optionally with photos; built on the server (ADR-0026 §4). */
export function ExportScreen() {
  const { t, num, locale } = useT();
  const online = useOnline();
  const toast = useToast();
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [range, setRange] = useState<'all' | 'dates'>('all');
  // OCT-187 §2.2: «Pick dates» opens on this year so far, never on empty fields.
  const [to, setTo] = useState<string | null>(localToday);
  const [from, setFrom] = useState<string | null>(
    () => `${to!.slice(0, 4)}-01-01`,
  );
  const [photos, setPhotos] = useState(false);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  // undefined: idle; null: downloading with no size to count against.
  const [percent, setPercent] = useState<number | null>();
  const [error, setError] = useState<'too_large' | 'failed' | null>(null);
  const download = useRef<AbortController>(null);

  const badDates = range === 'dates' && !!from && !!to && from > to;
  const query =
    range === 'all' || (from && to && !badDates)
      ? new URLSearchParams({
          format,
          photos: photos ? '1' : '0',
          ...(range === 'dates' && { from: from!, to: to! }),
        }).toString()
      : null;

  useEffect(() => {
    setSummary(null);
    if (!online || !query) return;
    const ctl = new AbortController();
    exportSummary(query, ctl.signal).then(setSummary, () => {});
    return () => ctl.abort();
  }, [online, query]);

  // Leaving the screen stops the download.
  useEffect(() => () => download.current?.abort(), []);

  async function start() {
    if (!query) return;
    const ctl = new AbortController();
    download.current = ctl;
    setError(null);
    setPercent(summary ? 0 : null);
    try {
      const file = await downloadExport(query, {
        signal: ctl.signal,
        total: summary?.bytes,
        onProgress: setPercent,
      });
      saveFile(file);
      toast({ text: t('integr.export.saved', { name: file.name }) });
    } catch (err) {
      if (ctl.signal.aborted) return;
      setError(
        err instanceof ApiError && err.code === 'export_too_large'
          ? 'too_large'
          : 'failed',
      );
    } finally {
      if (download.current === ctl) {
        download.current = null;
        setPercent(undefined);
      }
    }
  }

  const busy = percent !== undefined;
  const zip = format === 'csv' || photos;
  const count = (n: number) => ({ count: n, n: num(n) });
  return (
    <div className="settings">
      <p className="settings__lead">{t('integr.export.lead')}</p>
      <List>
        <FormRow label={t('integr.export.format')} stacked>
          <Segment
            label={t('integr.export.format')}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
            value={format}
            onChange={setFormat}
          />
        </FormRow>
        <FormRow
          label={t('integr.export.period')}
          description={
            badDates ? (
              <span className="import__error">
                {t('integr.export.bad_dates')}
              </span>
            ) : undefined
          }
          stacked
        >
          <Segment
            label={t('integr.export.period')}
            options={[
              { value: 'all', label: t('integr.export.all_time') },
              { value: 'dates', label: t('integr.export.dates') },
            ]}
            value={range}
            onChange={setRange}
          />
        </FormRow>
        {range === 'dates' && (
          <>
            <FormRow label={t('integr.export.from')}>
              <InlineDate
                label={t('integr.export.from')}
                value={from}
                onChange={setFrom}
                max={to ?? undefined}
                error={badDates}
              />
            </FormRow>
            <FormRow label={t('integr.export.to')}>
              <InlineDate
                label={t('integr.export.to')}
                value={to}
                onChange={setTo}
                min={from ?? undefined}
                error={badDates}
              />
            </FormRow>
          </>
        )}
        <FormRow
          label={t('integr.export.photos')}
          description={
            summary && summary.photos > 0
              ? t('integr.export.photos_more', count(summary.photos))
              : t('integr.export.photos_sub')
          }
        >
          <Switch
            checked={photos}
            onChange={setPhotos}
            label={t('integr.export.photos')}
          />
        </FormRow>
      </List>
      <p className="import__note" aria-live="polite">
        {!online
          ? t('integr.export.need_net')
          : summary &&
            [
              t('integr.export.days', count(summary.days)),
              t('integr.export.dishes', count(summary.dishes)),
              fileSize(summary.bytes, locale),
            ].join(' · ')}
      </p>
      <p className="import__note">{t('integr.export.not_included')}</p>
      {error && (
        <Banner tone="danger">{t(`integr.export.error_${error}`)}</Banner>
      )}
      <div className="import__actions">
        {busy && (
          <Button variant="plain" onClick={() => download.current?.abort()}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          disabled={!online || !query}
          loading={busy}
          onClick={() => void start()}
        >
          {busy
            ? percent === null
              ? t('integr.export.preparing')
              : t('integr.export.preparing_n', { n: num(percent) })
            : t(
                zip
                  ? 'integr.export.download_zip'
                  : 'integr.export.download_json',
              )}
        </Button>
      </div>
    </div>
  );
}
