import { Barcode, Bookmark, ScanText } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';

/** Package numbers: found by barcode, read from the label, or the user's own product. */
export type PackageKind = 'barcode' | 'label' | 'mine';

const ICON = { barcode: Barcode, label: ScanText, mine: Bookmark };

/** Where a package dish's numbers come from, in place of the confidence badge (OCT-313 §2). */
export function SourceBadge({ kind }: { kind: PackageKind }) {
  const { t } = useT();
  const Icon = ICON[kind];
  return (
    <Badge tone="ok">
      <Icon aria-hidden="true" />
      {t(`edit.source.${kind}`)}
    </Badge>
  );
}
