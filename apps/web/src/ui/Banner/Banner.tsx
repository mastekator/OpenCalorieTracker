import type { ReactNode } from 'react';
import { CircleAlert, Info, Sparkle, TriangleAlert, X } from 'lucide-react';
import { useT } from '../../i18n';
import './Banner.css';

type Tone = 'notice' | 'warning' | 'danger' | 'accent';

const ICONS = {
  notice: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  accent: Sparkle,
} as const;

type Props = {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replaces the tone's default icon. */
  icon?: ReactNode;
  /** Buttons in a row under the text; the first one is the main action. */
  actions?: ReactNode;
  /** Shows a 44×44 close button. */
  onClose?: () => void;
};

export function Banner({
  tone = 'notice',
  title,
  children,
  icon,
  actions,
  onClose,
}: Props) {
  const { t } = useT();
  const Icon = ICONS[tone];
  return (
    <div
      className={`banner banner--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <div className="banner__body">
        <span className="banner__icon">
          {icon ?? <Icon aria-hidden="true" />}
        </span>
        <div className="banner__text">
          {title && <p className="banner__title">{title}</p>}
          {children && <p>{children}</p>}
          {actions && <div className="banner__actions">{actions}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            className="banner__close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
