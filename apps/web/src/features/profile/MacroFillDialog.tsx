import { Fragment } from 'react';
import { useT } from '../../i18n';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { MACROS, type Macro, type Pct } from './fillMacros';

type Props = {
  open: boolean;
  /** Shares as entered, and what fillMacros made of them. */
  pct: Pct;
  filled: Pct;
  target: Macro;
  /** «Fill in and save». */
  onApply: () => void;
  /** «I'll fix it myself»: closes, the entered shares stay. */
  onSelf: () => void;
};

/** 8.8a: where the missing or extra percent goes before saving. */
export function MacroFillDialog({
  open,
  pct,
  filled,
  target,
  onApply,
  onSelf,
}: Props) {
  const { t } = useT();
  const diff = 100 - (pct.protein + pct.fat + pct.carbs);
  const short = diff > 0;
  return (
    <ConfirmDialog
      open={open}
      tone="primary"
      title={t(short ? 'manual.fill.title_short' : 'manual.fill.title_over', {
        n: Math.abs(diff),
      })}
      body={
        <>
          {t(`manual.fill.${short ? 'to' : 'from'}.${target}`)}
          <br />
          <span className="profile__nums">
            {MACROS.map((m, i) => (
              <Fragment key={m}>
                {i > 0 && ' · '}
                {pct[m] === filled[m] ? (
                  t('manual.fill.share', {
                    macro: t(`macro.${m}`),
                    n: pct[m],
                  })
                ) : (
                  <b>
                    {t('manual.fill.change', {
                      macro: t(`macro.${m}`),
                      from: pct[m],
                      to: filled[m],
                    })}
                  </b>
                )}
              </Fragment>
            ))}
          </span>
        </>
      }
      confirmLabel={t('manual.fill.apply')}
      cancelLabel={t('manual.fill.self')}
      onConfirm={onApply}
      onCancel={onSelf}
    />
  );
}
