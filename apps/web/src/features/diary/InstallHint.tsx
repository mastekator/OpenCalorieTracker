import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  appUrl,
  currentInstallPlatform,
  hideInstall,
  isInstallHidden,
  type InstallPlatform,
} from '../../app/install';
import { useT } from '../../i18n';
import { InstallCard } from '../../ui/InstallCard/InstallCard';
import { InstallSheet } from '../../ui/InstallSheet/InstallSheet';
import { useToast } from '../../ui/Toast/Toast';

/** The iPhone install hint on Today (OCT-25 2.1–2.4); nothing elsewhere or once installed. */
export function InstallHint({
  platform: given,
}: {
  /** Detected from the browser when omitted. */
  platform?: InstallPlatform | null;
}) {
  const [platform] = useState(() =>
    given === undefined ? currentInstallPlatform() : given,
  );
  const { t } = useT();
  const toast = useToast();
  const [shown, setShown] = useState(() => !isInstallHidden(Date.now()));
  const [open, setOpen] = useState(false);
  if (!platform || !shown) return null;
  return (
    <>
      <InstallCard
        onOpen={() => setOpen(true)}
        onHide={() => {
          hideInstall(Date.now());
          setShown(false);
          toast({ text: t('install.dismissed'), icon: <Info /> });
        }}
      />
      <InstallSheet
        open={open}
        onClose={() => setOpen(false)}
        variant={platform}
        url={appUrl()}
      />
    </>
  );
}
