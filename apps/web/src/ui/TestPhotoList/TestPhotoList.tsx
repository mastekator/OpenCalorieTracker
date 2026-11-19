import { Check, X } from 'lucide-react';
import type { AiTestMiss, AiTestPhoto } from '@oct/shared';
import { useT } from '../../i18n';
import { en } from '../../i18n/locales/en';
import type { Key } from '../../i18n/translate';
import { Badge } from '../Badge/Badge';
import '../Button/Button.css';
import './TestPhotoList.css';

/** Where the thumbnails come from (ADR-0019 §2). */
export const TEST_PHOTO_PATH = '/api/admin/ai/test-photos';

type Why = 'kcal' | 'exact' | 'approx' | 'empty' | 'nothing' | 'error';

/** A result without `misses` (set 1, `error <code>`) as a reason in words. */
export function whyOf(result: string): Why {
  if (result.startsWith('kcal ')) return 'kcal';
  if (result === 'Calories out of range') return 'kcal';
  if (result === 'not every dish is exact') return 'exact';
  if (result === 'a mixed dish is exact') return 'approx';
  if (result === 'expected no dishes') return 'empty';
  if (result === 'no dishes') return 'nothing';
  return 'error';
}

/** The server's text for an empty dish set (model-test/compare.ts). */
const isNone = (dishes?: string) => dishes === '(none)';

/**
 * `egg, egg, toast` → `egg × 2, toast`, in order of first appearance; `(none)` → null.
 * Set 2 counts come written: `egg ×3` → `egg × 3`.
 */
export function dishLabel(dishes: string): string | null {
  if (isNone(dishes)) return null;
  const counts = new Map<string, number>();
  for (const item of dishes.split(', ')) {
    const [, name = item, n = '1'] = /^(.*) ×(\d+)$/.exec(item) ?? [];
    counts.set(name, (counts.get(name) ?? 0) + Number(n));
  }
  return [...counts]
    .map(([name, n]) => (n > 1 ? `${name}\u00a0×\u00a0${n}` : name))
    .join(', ');
}

/** `egg ×3; 150-300 kcal; exact`, `sausage; 172-316 kcal/100 g; exact` (expectedText on the server), set 1's `egg, egg; …` or `(none)`. */
export function parseExpected(text: string) {
  const [dishes = text, kcal = '', level] = text.split('; ');
  const [min, max] = kcal.split(' ')[0]!.split('-');
  return {
    name: dishLabel(dishes),
    empty: isNone(text),
    min: Number(min),
    max: Number(max),
    per100: kcal.endsWith(' kcal/100 g'),
    exact: level === 'exact',
  };
}

const sec = (ms: number) => (ms / 1000).toFixed(1);

type Props = {
  photos: AiTestPhoto[];
  /** While the run goes on, its first pending photo is the one in flight. */
  running?: boolean;
};

/** One row per reference photo: what was expected, what came back, ok or why not (OCT-248 4.2–4.5). */
export function TestPhotoList({ photos, running = false }: Props) {
  const { t, locale } = useT();
  const current = running
    ? photos.findIndex((p) => p.result === 'pending')
    : -1;
  const num = (n: number) => n.toLocaleString(locale);
  // A code this client has no text for shows as a dash, not the generic error.
  const errorText = (code: string) =>
    code in en.errors ? t(`errors.${code}` as Key) : '—';
  const level = (exact: boolean) =>
    t(exact ? 'ai.test.level.exact' : 'ai.test.level.approx');
  const reason = (m: AiTestMiss) =>
    m.code === 'not_recognized'
      ? t('ai.test.why.not_recognized', { dishes: m.dishes.join(', ') })
      : m.code === 'count'
        ? t('ai.test.why.count', {
            dish: m.dish,
            expected: num(m.expected),
            got: num(m.got),
          })
        : t(`ai.test.why.${m.code}`);
  const reasons = (p: AiTestPhoto) =>
    p.misses?.length
      ? p.misses.map(reason).join(' · ')
      : t(`ai.test.why.${whyOf(p.result)}`);

  return (
    <ul className="test-photos">
      {photos.map((p, i) => {
        const e = parseExpected(p.expected);
        const name = e.name ?? t('ai.test.not_food');
        const waiting = p.result === 'pending' || p.result === 'not_run';
        const levels = p.levels ? p.levels.split(',') : [];
        const got = p.got === undefined ? null : dishLabel(p.got);
        return (
          <li
            key={p.file}
            className={`test-photos__row${waiting && i !== current ? ' test-photos__row--wait' : ''}`}
          >
            <img
              className="test-photos__thumb"
              src={`${TEST_PHOTO_PATH}/${encodeURIComponent(p.file)}`}
              alt={t('ai.test.photo_alt', { name })}
              loading="lazy"
            />
            <span className="test-photos__main">
              <span className="test-photos__name">{name}</span>
              <span className="test-photos__line">
                {t('ai.test.expected')}:{' '}
                {e.empty ? (
                  t('ai.test.empty')
                ) : (
                  <>
                    <span className="test-photos__dish">{e.name}</span>
                    {` · ${t(e.per100 ? 'ai.test.kcal_100g' : 'ai.test.kcal', { min: num(e.min), max: num(e.max) })} · ${level(e.exact)}`}
                  </>
                )}
              </span>
              {!waiting && (
                <>
                  <span
                    className="test-photos__line test-photos__got"
                    title={got ?? undefined}
                  >
                    <b>{t('ai.test.got')}:</b>{' '}
                    {p.result.startsWith('error ') ? (
                      errorText(p.result.slice('error '.length))
                    ) : !got || p.kcal === undefined ? (
                      t('ai.test.empty')
                    ) : (
                      <>
                        <span className="test-photos__dish">{got}</span>
                        {` · ${t('ai.test.got_kcal', { kcal: num(p.kcal) })} · ${level(levels.every((l) => l === 'exact'))}`}
                      </>
                    )}
                  </span>
                  {p.result === 'ok' ? (
                    <span className="test-photos__line">
                      <Badge tone="ok">
                        <Check aria-hidden="true" />
                        {t('ai.test.ok')}
                      </Badge>
                    </span>
                  ) : (
                    <span className="test-photos__line test-photos__why">
                      <X aria-hidden="true" />
                      <span>
                        {/* Red is not the only sign of a miss for VoiceOver. */}
                        <span className="test-photos__hidden">
                          {t('ai.test.failed')}{' '}
                        </span>
                        {reasons(p)}
                      </span>
                    </span>
                  )}
                </>
              )}
            </span>
            <span className="test-photos__end">
              {i === current ? (
                <span
                  className="button__spinner test-photos__spinner"
                  aria-hidden="true"
                />
              ) : p.result === 'pending' ? (
                t('ai.test.waiting')
              ) : p.result === 'not_run' ? (
                t('ai.test.not_run')
              ) : (
                p.ms !== undefined &&
                t('ai.test.sec', { sec: num(Number(sec(p.ms))) })
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
