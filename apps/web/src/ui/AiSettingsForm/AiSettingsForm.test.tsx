import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { AdminAiStatus } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { AiSettingsForm } from './AiSettingsForm';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const off = {
  provider: null,
  providerName: null,
  model: null,
  keySet: false,
  baseUrlHost: null,
  source: null,
  keyLast4: null,
  keyUnreadable: false,
  savedInactive: false,
  rev: null,
  refineLimit: null,
  state: 'not_configured',
  checkedAt: null,
} satisfies AdminAiStatus;

describe('AiSettingsForm', () => {
  it('shows a spinner in the Model row while the list loads', async () => {
    const noop = () => {};
    await renderLoaded(
      <I18nProvider>
        <AiSettingsForm
          status={off}
          draft={{ provider: 'google', baseUrl: '', apiKey: 'k', model: '' }}
          onChange={noop}
          keyOpen
          onReplaceKey={noop}
          dirty
          busy={null}
          failed={null}
          checked={null}
          conflict={false}
          onCheck={noop}
          onSave={noop}
          onSaveAnyway={noop}
          onReload={noop}
          models={{ list: null, loading: true, error: null }}
          onLoadModels={noop}
        />
      </I18nProvider>,
    );
    const row = screen.getByText('Loading models…');
    expect(row.querySelector('.button__spinner')).toBeTruthy();
  });
});
