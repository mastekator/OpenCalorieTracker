import { Check, X } from 'lucide-react';
import type { AiTestPhoto } from '@oct/shared';
import { useT } from '../../i18n';
import { en } from '../../i18n/locales/en';
import type { Key } from '../../i18n/translate';
import { Badge } from '../Badge/Badge';
import '../Button/Button.css';
import './TestPhotoList.css';

/** Where the thumbnails come from (ADR-0019 §2). */
export const TEST_PHOTO_PATH = '/api/admin/ai/test-photos';

type Why = 'range' | 'exact' | 'approx' | 'empty' | 'nothing' | 'error';

/** The server's miss text (model-test/compare.ts) as a reason in words. */
export function whyOf(result: string): Why {
  if (result.startsWith('kcal ')) return 'range';
  if (result === 'not every dish is exact') return 'exact';
  if (result === 'a mixed dish is exact') return 'approx';
  if (result === 'expected no dishes') return 'empty';
  if (result === 'no dishes') return 'nothing';
  return 'error';
}

/** The server's text for an empty dish set (model-test/compare.ts). */
const isNone = (dishes?: string) => dishes === '(none)';

/** `egg, egg, toast` → `egg × 2, toast`, in order of first appearance; `(none)` → null. */
export function dishLabel(dishes: string): string | null {
  if (isNone(dishes)) return null;
  const counts = new Map<string, number>();
  for (const name of dishes.split(', '))
    counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .map(([name, n]) => (n > 1 ? `${name}\u00a0×\u00a0${n}` : name))
    .join(', ');
}

/** `egg, egg; 150-300 kcal; exact` (expectedText on the server) or `(none)`. */
function parseExpected(text: string) {
  const [dishes = text, kcal = '', level] = text.split('; ');
  const [min, max] = kcal.replace(' kcal', '').split('-');
  return {
    name: dishLabel(dishes),
    empty: isNone(text),
    min,
    max,
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

  return (
    <ul className="test-photos">
      {photos.map((p, i) => {
        const e = parseExpected(p.expected);
        const name = e.name ?? t('ai.test.not_food');
        const waiting = p.result === 'pending' || p.result === 'not_run';
        const levels = p.levels ? p.levels.split(',') : [];
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
                {e.empty
                  ? t('ai.test.empty')
                  : `${t('ai.test.kcal', { min: num(Number(e.min)), max: num(Number(e.max)) })} · ${level(e.exact)}`}
              </span>
              {!waiting && (
                <>
                  <span className="test-photos__line">
                    <b>{t('ai.test.got')}:</b>{' '}
                    {p.result.startsWith('error ')
                      ? errorText(p.result.slice('error '.length))
                      : isNone(p.got) || p.kcal === undefined
                        ? t('ai.test.empty')
                        : `${t('ai.test.got_kcal', { kcal: num(p.kcal) })} · ${level(levels.every((l) => l === 'exact'))}`}
                  </span>
                  <span className="test-photos__line">
                    {p.result === 'ok' ? (
                      <Badge tone="ok">
                        <Check aria-hidden="true" />
                        {t('ai.test.ok')}
                      </Badge>
                    ) : (
                      <Badge tone="err">
                        <X aria-hidden="true" />
                        {t(`ai.test.why.${whyOf(p.result)}`)}
                      </Badge>
                    )}
                  </span>
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
