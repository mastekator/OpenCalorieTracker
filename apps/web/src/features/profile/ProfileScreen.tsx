import { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { z } from 'zod';
import {
  aiStatusSchema,
  type AiStatus,
  type ProfileRequest,
  type ProfileResponse,
} from '@oct/shared';
import { api } from '../../api/client';
import { useSession } from '../../app/SessionContext';
import { useRequireOnline } from '../../app/connection';
import { useDb, useSettings } from '../../data/DataContext';
import { patchSettings } from '../../data/outbox';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { useToast } from '../../ui/Toast/Toast';
import { AgentChat } from './AgentChat';
import { ProfileForm } from './ProfileForm';

// Our own server: trust the shape, as data/sync.ts does.
const profileResponse = z.custom<ProfileResponse>();

type Loaded = { profile: ProfileResponse; interview: AiStatus['interview'] };

/** /profile: loads the profile and whether the assistant is set up, then the form. */
export function ProfileScreen() {
  const { t } = useT();
  const { user } = useSession();
  const db = useDb();
  const settings = useSettings();
  const units = settings?.units ?? user?.units ?? 'metric';
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [chat, setChat] = useState(false);
  const requireOnline = useRequireOnline();
  const toast = useToast();
  const today = new Date().toLocaleDateString('sv');
  const disclaimerHidden =
    settings?.normDisclaimerHidden ?? user?.normDisclaimerHidden ?? false;

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([
      api('/api/profile', profileResponse),
      // Without a status the assistant is just not offered.
      api('/api/ai/status', aiStatusSchema).then(
        (s) => s.interview,
        () => 'not_configured' as const,
      ),
    ]).then(
      ([profile, interview]) => setData({ profile, interview }),
      () => setFailed(true),
    );
  }, []);
  useEffect(load, [load]);

  if (failed)
    return (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        title={t('errors.internal')}
        action={
          <Button variant="tonal" onClick={load}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  if (!data)
    return (
      <Delayed>
        <div className="profile">
          <Skeleton height="calc(var(--space-12) * 4)" />
          <Skeleton height="calc(var(--control-height) * 5)" />
        </div>
      </Delayed>
    );
  return (
    <>
      <ProfileForm
        // A goal applied in the chat replaces the form's state wholesale.
        key={data.profile.rev}
        initial={data.profile}
        units={units}
        today={today}
        onAgent={
          data.interview === 'not_configured'
            ? undefined
            : requireOnline('agent', () => setChat(true))
        }
        onSave={(body: ProfileRequest) =>
          api('/api/profile', profileResponse, { method: 'PUT', body })
        }
        disclaimerHidden={disclaimerHidden}
        onHideDisclaimer={() =>
          void patchSettings(db, { normDisclaimerHidden: true })
        }
      />
      <AgentChat
        open={chat}
        onClose={() => setChat(false)}
        units={units}
        today={today}
        manualKcal={data.profile.manual?.kcal ?? null}
        disclaimerHidden={disclaimerHidden}
        onApplied={(profile) => {
          setChat(false);
          setData({ ...data, profile });
          toast({ text: t('chat.applied') });
        }}
        // shortcut: the screen has no manual-goal switch yet, so 9.8 just returns to the form.
        onManual={() => setChat(false)}
      />
    </>
  );
}
