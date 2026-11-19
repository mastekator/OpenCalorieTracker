import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AdminAiStatus } from '@oct/shared';
import { ProviderStatus } from './ProviderStatus';

const gemini: AdminAiStatus = {
  provider: 'google',
  providerName: 'Google Gemini',
  model: 'gemini-3.8-flash',
  keySet: true,
  baseUrlHost: null,
  source: 'env',
  keyLast4: null,
  keyUnreadable: false,
  savedInactive: false,
  rev: null,
  refineLimit: null,
  testPhotoCount: 9,
  state: 'ok',
  checkedAt: Date.now() - 20 * 60_000,
};
const error = (
  state: AdminAiStatus['state'],
  status: number,
  message: string,
): AdminAiStatus => ({ ...gemini, state, details: { status, message } });

/** Admin «AI provider», OCT-25 §5 (5.1–5.5); D.2 at ≥ 1024 px. Offline (5.6): Settings/Screens. */
const meta = {
  title: 'UI/ProviderStatus',
  component: ProviderStatus,
  args: { status: gemini },
  decorators: [
    (Story) => (
      <div className="screen__body">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProviderStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 5.1 Working. The form under the state: UI/AiSettingsForm. */
export const Ok: Story = {};
export const OkDark: Story = { ...dark };
/** 5.2 Key rejected, with «Details». */
export const AuthError: Story = {
  args: {
    status: error(
      'auth_error',
      403,
      'PERMISSION_DENIED: API key not valid. Please pass a valid API key.',
    ),
  },
};
export const AuthErrorDark: Story = { ...AuthError, ...dark };
export const Quota: Story = {
  args: {
    status: error('quota_exceeded', 429, 'RESOURCE_EXHAUSTED: Quota exceeded'),
  },
};
export const QuotaDark: Story = { ...Quota, ...dark };
export const Unavailable: Story = {
  args: { status: error('unavailable', 503, 'Service Unavailable') },
};
export const UnavailableDark: Story = { ...Unavailable, ...dark };
/** HTTP 404: the model id is unknown or retired at the provider. */
export const ModelNotFound: Story = {
  args: {
    status: {
      ...error(
        'model_not_found',
        404,
        'models/gemini-2.5-flash is not found for API version v1beta, or is not supported for generateContent.',
      ),
      model: 'gemini-2.5-flash',
    },
  },
};
export const ModelNotFoundDark: Story = { ...ModelNotFound, ...dark };
/** Own server: a 404 may also be a wrong AI_BASE_URL path. */
export const ModelNotFoundCompatible: Story = {
  args: {
    status: {
      ...error('model_not_found', 404, 'model "qwen2.5vl:7b" not found'),
      provider: 'openai-compatible',
      providerName: null,
      model: 'qwen2.5vl:7b',
      keySet: false,
      baseUrlHost: '192.168.1.20:11434',
    },
  },
};
export const ModelNotFoundCompatibleDark: Story = {
  ...ModelNotFoundCompatible,
  ...dark,
};
/** The call ran out of its time; no provider message. */
export const Timeout: Story = {
  args: {
    status: { ...gemini, state: 'timeout', details: { timeoutSec: 20 } },
  },
};
export const TimeoutDark: Story = { ...Timeout, ...dark };
export const NoVision: Story = {
  args: { status: { ...gemini, state: 'no_vision' } },
};
export const NoVisionDark: Story = { ...NoVision, ...dark };
/** Configured, no request since start: neutral, no «Last request» line. */
export const Unknown: Story = {
  args: { status: { ...gemini, state: 'unknown', checkedAt: null } },
};
export const UnknownDark: Story = { ...Unknown, ...dark };
/** 5.3 Not set up: grey, nothing is sent. */
export const NotConfigured: Story = {
  args: {
    status: {
      ...gemini,
      provider: null,
      providerName: null,
      model: null,
      keySet: false,
      baseUrlHost: null,
      source: null,
      state: 'not_configured',
      checkedAt: null,
    },
  },
};
export const NotConfiguredDark: Story = { ...NotConfigured, ...dark };
/** 5.4 Own server: host only, no policy link. */
export const Compatible: Story = {
  args: {
    status: {
      ...gemini,
      provider: 'openai-compatible',
      providerName: null,
      model: 'qwen2.5vl:7b',
      keySet: false,
      baseUrlHost: '192.168.1.20:11434',
    },
  },
};
export const CompatibleDark: Story = { ...Compatible, ...dark };
