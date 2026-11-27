import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import {
  type Profile,
  type ProfileRequest,
  type ProfileResponse,
} from '@oct/shared';
import { api } from '../../api/client';
import { useSession } from '../../app/SessionContext';
import {
  useAiStatus,
  useDb,
  useProfile,
  useRecipes,
  useSettings,
  useWeighings,
} from '../../data/DataContext';
import { deleteWeighing, patchSettings, putWeighing } from '../../data/outbox';
import type { Db } from '../../data/db';
import { storeProfile } from '../../data/sync';
import { localToday } from '../diary/day';
import { useT } from '../../i18n';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { useToast } from '../../ui/Toast/Toast';
import { WeighInSheet } from '../weight/WeighInSheet';
import { AgentChat } from './AgentChat';
import { ProfileForm } from './ProfileForm';

// Our own server: trust the shape, as data/sync.ts does.
const profileResponse = z.custom<ProfileResponse>();

/** PUT /api/profile, then the answer into the local copy. */
export const saveProfile = (db: Db, body: ProfileRequest) =>
  api('/api/profile', profileResponse, { method: 'PUT', body }).then((saved) =>
    storeProfile(db, saved),
  );

/** /profile: the profile from the local copy (ADR-0014 §5), read-only offline (8.15). */
export function ProfileScreen() {
  const { t } = useT();
  const { user } = useSession();
  const db = useDb();
  const settings = useSettings();
  const profile = useProfile();
  const online = useOnline();
  const units = settings?.units ?? user?.units ?? 'metric';
  const ai = useAiStatus();
  // Without a status the assistant is just not offered.
  // While it refreshes, the status stored on this device stands.
  const interview =
    ai.loading && !ai.status
      ? undefined
      : (ai.status?.interview ?? 'not_configured');
  const [chat, setChat] = useState(false);
  const [manualAt, setManualAt] = useState(0);
  const [agentDraft, setAgentDraft] = useState<{
    profile: Profile | null;
    at: number;
  }>();
  const [agentDown, setAgentDown] = useState(false);
  const weighings = useWeighings();
  const recipes = useRecipes();
  const [, navigate] = useLocation();
  const [weighIn, setWeighIn] = useState(false);
  const toast = useToast();
  const today = localToday();
  const disclaimerHidden =
    settings?.normDisclaimerHidden ?? user?.normDisclaimerHidden ?? false;

  if (!profile || (online && !interview))
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
        // A newer profile (a goal applied in the chat, another device) replaces the form's state.
        key={profile.rev}
        initial={profile}
        units={units}
        today={today}
        readOnly={!online}
        // Offline the status is unknown: the button shows, greyed out (8.15).
        onAgent={
          ai.off || (online && interview === 'not_configured')
            ? undefined
            : // 8.14: configured but not answering — a banner instead of the chat.
              () =>
                online && interview === 'unavailable'
                  ? setAgentDown(true)
                  : setChat(true)
        }
        agentUnavailable={agentDown}
        onSave={(body: ProfileRequest) => saveProfile(db, body)}
        disclaimerHidden={disclaimerHidden}
        onHideDisclaimer={() =>
          void patchSettings(db, { normDisclaimerHidden: true })
        }
        manualAt={manualAt}
        agentDraft={agentDraft}
        weighedOn={weighings?.at(-1)?.date}
        onWeighIn={() => setWeighIn(true)}
        sections={
          <List>
            {/* A link: the kitchen reads the local copy and works offline, past the disabled fieldset. */}
            <ListRow
              href="/kitchen"
              onClick={(e) => {
                e.preventDefault();
                navigate('/kitchen');
              }}
              icon={<ChefHat aria-hidden="true" />}
              description={
                recipes && t('kitchen.row.sub', { count: recipes.length })
              }
            >
              {t('kitchen.title')}
            </ListRow>
          </List>
        }
      />
      {weighings && (
        <WeighInSheet
          open={weighIn}
          onClose={() => setWeighIn(false)}
          today={today}
          units={units}
          weighings={weighings}
          profile={profile}
          onPut={(date, kg) => putWeighing(db, date, kg)}
          onDelete={(date) => deleteWeighing(db, date)}
        />
      )}
      <AgentChat
        open={chat}
        onClose={() => setChat(false)}
        units={units}
        today={today}
        manualKcal={profile.manual?.kcal ?? null}
        disclaimerHidden={disclaimerHidden}
        onApplied={(applied) => {
          setChat(false);
          void storeProfile(db, applied).catch(() => {}); // closed by a user switch
          toast({ text: t('chat.applied') });
        }}
        // 9.8: back to the form with «Set my own goal» on.
        onManual={() => {
          setChat(false);
          setManualAt((n) => n + 1);
        }}
        onForm={(draft) => {
          setChat(false);
          setAgentDraft({ profile: draft, at: Date.now() });
        }}
      />
    </>
  );
}
