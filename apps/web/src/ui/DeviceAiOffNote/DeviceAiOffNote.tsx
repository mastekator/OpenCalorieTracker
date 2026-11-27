import { Power } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../../i18n';
import './DeviceAiOffNote.css';

type Props = {
  /** «Settings → AI». */
  href: string;
  /** Before the link navigates, e.g. close the sheet it sits in. */
  onNavigate?: () => void;
};

/** «AI is off on this device · Settings» (OCT-178 4.4, 4.5): why a photo opens manual entry. */
export function DeviceAiOffNote({ href, onNavigate }: Props) {
  const { t } = useT();
  return (
    <p className="device-ai-off">
      <Power aria-hidden="true" />
      <span>
        {t('capture.ai_off')} ·{' '}
        <Link href={href} className="device-ai-off__link" onClick={onNavigate}>
          {t('capture.ai_off_link')}
        </Link>
      </span>
    </p>
  );
}
