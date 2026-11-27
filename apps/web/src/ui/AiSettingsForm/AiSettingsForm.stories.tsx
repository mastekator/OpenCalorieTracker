import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AdminAiStatus, AiProviderId } from '@oct/shared';
import { ProviderStatus } from '../ProviderStatus/ProviderStatus';
import { AiSettingsForm, type AiDraftState } from './AiSettingsForm';

const saved: AdminAiStatus = {
  provider: 'google',
  providerName: 'Google Gemini',
  model: 'gemini-3.5-flash-lite',
  keySet: true,
  baseUrlHost: null,
  source: 'admin',
  keyLast4: 'a3F9',
  keyUnreadable: false,
  savedInactive: false,
  rev: 3,
  allowUserKeys: true,
  userKeysLocked: false,
  userKeyCount: 0,
  refineLimit: null,
  testPhotoCount: 9,
  state: 'ok',
  checkedAt: Date.now() - 5 * 60_000,
};
const off: AdminAiStatus = {
  ...saved,
  provider: null,
  providerName: null,
  model: null,
  keySet: false,
  source: null,
  keyLast4: null,
  rev: null,
  state: 'not_configured',
  checkedAt: null,
};

type Props = ComponentProps<typeof AiSettingsForm>;
type Args = Partial<Props> & { status: AdminAiStatus };

/** The form under the state card, as on the screen; the draft is live. */
function Screen({ draft: initial, ...args }: Args) {
  const [draft, setDraft] = useState<AiDraftState>(
    initial ?? {
      provider: (args.status.provider as AiProviderId | null) ?? 'google',
      baseUrl: '',
      apiKey: '',
      model: args.status.model ?? '',
    },
  );
  const [replacing, setReplacing] = useState(false);
  const noop = () => {};
  return (
    <ProviderStatus status={args.status}>
      <AiSettingsForm
        keyOpen={
          replacing ||
          draft.provider !== args.status.provider ||
          !args.status.keySet ||
          !!draft.baseUrl.trim()
        }
        dirty={false}
        busy={null}
        failed={null}
        checked={null}
        conflict={false}
        onCheck={noop}
        onSave={noop}
        onSaveAnyway={noop}
        onReload={noop}
        models={{ list: null, loading: false, error: null }}
        onLoadModels={noop}
        {...args}
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onReplaceKey={() => setReplacing(true)}
      />
    </ProviderStatus>
  );
}

/** Admin «AI provider» form, OCT-248 §1–3; D.2 at ≥ 1024 px. */
const meta = {
  title: 'UI/AiSettingsForm',
  component: Screen,
  args: { status: saved },
  decorators: [
    (Story) => (
      <div className="screen__body">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 1.1 Set up, nothing changed: «Set · …a3F9», one «Check now», Gemini warning. */
export const Saved: Story = {};
export const SavedDark: Story = { ...dark };
/** 1.2 First connection: key field, «Check» and «Save». */
export const FirstConnection: Story = {
  args: {
    status: off,
    dirty: true,
    draft: {
      provider: 'google',
      baseUrl: '',
      apiKey: 'AIzaSyD-example-key',
      model: '',
    },
  },
};
export const FirstConnectionDark: Story = { ...FirstConnection, ...dark };
/** «Save» pressed: both buttons wait. */
export const Saving: Story = {
  args: {
    dirty: true,
    busy: 'save',
    draft: {
      provider: 'google',
      baseUrl: '',
      apiKey: '',
      model: 'gemini-3.8-flash',
    },
  },
};
export const SavingDark: Story = { ...Saving, ...dark };
/** 1.3 Another provider: its own key, the hint under the field. */
export const ProviderChanged: Story = {
  args: {
    dirty: true,
    draft: { provider: 'openai', baseUrl: '', apiKey: '', model: '' },
  },
};
export const ProviderChangedDark: Story = { ...ProviderChanged, ...dark };
/** 2.4 The saved model doesn't accept photos. */
export const NoVision: Story = {
  args: {
    status: { ...saved, model: 'gemma-4-2b-it', state: 'no_vision' },
  },
};
export const NoVisionDark: Story = { ...NoVision, ...dark };
/** 2.5 Own server: the address, the key is optional. */
export const Compatible: Story = {
  args: {
    status: {
      ...saved,
      provider: 'openai-compatible',
      providerName: null,
      model: 'qwen3-vl:8b',
      keySet: false,
      keyLast4: null,
      baseUrlHost: '192.168.1.20:11434',
    },
  },
};
export const CompatibleDark: Story = { ...Compatible, ...dark };
/** Own server with a saved key and a new address: the key stays with the saved host. */
export const CompatibleNewAddress: Story = {
  args: {
    dirty: true,
    status: {
      ...saved,
      provider: 'openai-compatible',
      providerName: null,
      model: 'qwen3-vl:8b',
      keyLast4: 'a3F9',
      baseUrlHost: '192.168.1.20:11434',
    },
    draft: {
      provider: 'openai-compatible',
      baseUrl: 'http://10.0.0.5:1234/v1',
      apiKey: '',
      model: 'qwen3-vl:8b',
    },
  },
};
export const CompatibleNewAddressDark: Story = {
  ...CompatibleNewAddress,
  ...dark,
};
/** A draft check that didn't pass, with the provider's reply. */
export const CheckFailed: Story = {
  args: {
    dirty: true,
    checked: {
      state: 'auth_error',
      checkedAt: Date.now(),
      details: { status: 401, message: 'Incorrect API key provided' },
    },
    draft: {
      provider: 'openai',
      baseUrl: '',
      apiKey: 'sk-wrong',
      model: 'gpt-5-mini',
    },
  },
};
export const CheckFailedDark: Story = { ...CheckFailed, ...dark };
/** 3.1 Save didn't pass the check: «Not saved» and «Save anyway». */
export const NotSaved: Story = {
  args: {
    dirty: true,
    failed: {
      state: 'unavailable',
      checkedAt: null,
      details: { status: 503, message: 'Service Unavailable' },
    },
    draft: {
      provider: 'google',
      baseUrl: '',
      apiKey: '',
      model: 'gemini-3.8-pro',
    },
  },
};
export const NotSavedDark: Story = { ...NotSaved, ...dark };

/** OCT-178 1.8: a user's own key — the save is the check, so no «Save anyway» and no draft «Check». */
export const OwnKeyNotSaved: Story = {
  args: {
    ...NotSaved.args,
    title: 'Your key',
    onSaveAnyway: undefined,
    failed: { state: 'auth_error', checkedAt: null, details: { status: 401 } },
    draft: {
      provider: 'openai',
      baseUrl: '',
      apiKey: 'sk-proj-…',
      model: 'gpt-5-mini',
    },
  },
};
export const OwnKeyNotSavedDark: Story = { ...OwnKeyNotSaved, ...dark };
/** 3.2 The saved key doesn't decrypt: AI is off, the key field shows why. */
export const KeyUnreadable: Story = {
  args: {
    dirty: true,
    status: {
      ...saved,
      keySet: false,
      keyLast4: null,
      source: null,
      keyUnreadable: true,
      state: 'not_configured',
      checkedAt: null,
    },
  },
};
export const KeyUnreadableDark: Story = { ...KeyUnreadable, ...dark };
/** 3.3 Settings from .env: read-only rows, saved ones inactive. */
export const Env: Story = {
  args: {
    status: {
      ...saved,
      source: 'env',
      keyLast4: null,
      savedInactive: true,
    },
  },
};
export const EnvDark: Story = { ...Env, ...dark };
/** 3.5 Changed in another window: nothing is overwritten. */
export const Conflict: Story = {
  args: {
    dirty: true,
    conflict: true,
    draft: {
      provider: 'google',
      baseUrl: '',
      apiKey: '',
      model: 'gemini-3.8-flash',
    },
  },
};
export const ConflictDark: Story = { ...Conflict, ...dark };
/** 1.2 The key is typed: the list is on its way. */
export const LoadingModels: Story = {
  args: {
    ...FirstConnection.args,
    models: { list: null, loading: true, error: null },
  },
};
export const LoadingModelsDark: Story = { ...LoadingModels, ...dark };
/** 2.4 A model the list marks as photo-less: the label and the warning before saving. */
export const PickedNoVision: Story = {
  args: {
    dirty: true,
    models: {
      list: [
        { id: 'gemini-3.8-flash', vision: true },
        { id: 'gemma-4-2b-it', vision: false },
      ],
      loading: false,
      error: null,
    },
    draft: {
      provider: 'google',
      baseUrl: '',
      apiKey: '',
      model: 'gemma-4-2b-it',
    },
  },
};
export const PickedNoVisionDark: Story = { ...PickedNoVision, ...dark };
