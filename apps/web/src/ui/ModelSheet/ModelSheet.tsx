import { useDeferredValue, useState } from 'react';
import { Check, Pencil, RefreshCw, Search, SearchX, X } from 'lucide-react';
import type { AiModelInfo } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import '../List/List.css';
import { Sheet } from '../Sheet/Sheet';
import './ModelSheet.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The provider's list; null until it comes. */
  models: AiModelInfo[] | null;
  loading: boolean;
  /** Why the list did not come, in words: the manual field opens at once (OCT-248 2.3). */
  error: string | null;
  /** The draft's model, checked in the list and prefilled in the manual field. */
  value: string;
  onPick: (model: string) => void;
  onRefresh: () => void;
  /** Search text on open; stories show a search in progress with it. */
  initialQuery?: string;
};

const GROUPS = [
  { vision: true, title: 'ai.models.photo' },
  { vision: null, title: 'ai.models.unknown' },
  { vision: false, title: 'ai.models.no_photo' },
] as const;

/** The match in the name, case-insensitive. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="model-sheet__mark">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

/** The provider's models with search, photo groups and manual entry (OCT-248 1.4, §2). */
export function ModelSheet({ open, onClose, onRefresh, ...props }: Props) {
  const { t } = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={t('ai.model')}
      action={{
        label: t('ai.models.refresh'),
        icon: RefreshCw,
        onClick: onRefresh,
      }}
    >
      {/* Mounted only while open, so the search and manual entry start fresh each time. */}
      <Body {...props} onRefresh={onRefresh} />
    </Sheet>
  );
}

function Body({
  models,
  loading,
  error,
  value,
  onPick,
  onRefresh,
  initialQuery = '',
}: Omit<Props, 'open' | 'onClose'>) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery);
  const [manual, setManual] = useState<string | null>(null);
  // Typing stays instant on a 300+ model list; filtering catches up (OCT-276).
  const deferred = useDeferredValue(query.trim());
  const [empty, setEmpty] = useState(false);

  if (error || manual !== null) {
    const name = manual ?? value;
    return (
      <div className="model-sheet__manual">
        {error && <Banner tone="danger">{error}</Banner>}
        <Field
          label={t('ai.models.name')}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          hint={t('ai.models.name_hint')}
          error={empty ? t('ai.form.model_required') : undefined}
          value={name}
          onChange={(event) => {
            setManual(event.target.value);
            setEmpty(false);
          }}
        />
        <Button
          onClick={() => (name.trim() ? onPick(name.trim()) : setEmpty(true))}
        >
          {t('ai.models.done')}
        </Button>
        {error && (
          <Button variant="plain" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            {t('ai.models.refresh')}
          </Button>
        )}
      </div>
    );
  }

  if (!models || loading)
    return (
      <p className="model-sheet__note" role="status">
        {t('ai.models.loading')}
      </p>
    );

  const q = deferred.toLowerCase();
  const found = q
    ? models.filter((m) => m.id.toLowerCase().includes(q))
    : models;
  const toManual = (
    <Button variant="plain" onClick={() => setManual(query.trim() || value)}>
      <Pencil aria-hidden="true" />
      {t('ai.models.manual')}
    </Button>
  );

  return (
    <div className="model-sheet">
      <div className="model-sheet__search">
        <Search aria-hidden="true" />
        <input
          type="search"
          className="model-sheet__input"
          aria-label={t('ai.models.search')}
          placeholder={t('ai.models.search')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="model-sheet__clear"
            aria-label={t('ai.models.clear')}
            onClick={() => setQuery('')}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {found.length === 0 ? (
        <div className="model-sheet__none">
          <SearchX aria-hidden="true" />
          <p className="model-sheet__none-title" role="status">
            {t('ai.models.nothing', { query: query.trim() })}
          </p>
          <Button variant="tonal" small onClick={() => setManual(query.trim())}>
            <Pencil aria-hidden="true" />
            {t('ai.models.manual_query', { query: query.trim() })}
          </Button>
        </div>
      ) : (
        <>
          <p className="model-sheet__note" role="status">
            {q
              ? `${t('ai.models.found', { count: found.length })} · ${t('ai.models.count', { count: models.length })}`
              : t('ai.models.count', { count: models.length })}
          </p>
          {GROUPS.map(({ vision, title }) => {
            const rows = found.filter((m) => m.vision === vision);
            if (!rows.length) return null;
            return (
              <section key={title} className="list model-sheet__group">
                <h3 className="list__title">{t(title)}</h3>
                <ul
                  className="list__rows"
                  role="radiogroup"
                  aria-label={t(title)}
                >
                  {rows.map((m) => (
                    <li
                      key={m.id}
                      className="list__item model-sheet__row"
                      role="none"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={m.id === value}
                        className="list-row list-row--interactive"
                        onClick={() => onPick(m.id)}
                      >
                        <span className="list-row__label model-sheet__mono">
                          <Highlight text={m.id} query={deferred} />
                        </span>
                        {vision !== null && (
                          <Badge tone={vision ? 'ok' : 'neutral'}>
                            {t(vision ? 'ai.form.photo' : 'ai.form.no_photo')}
                          </Badge>
                        )}
                        <span className="model-sheet__check" aria-hidden="true">
                          {m.id === value && <Check />}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <div className="model-sheet__foot">{toManual}</div>
        </>
      )}
    </div>
  );
}
