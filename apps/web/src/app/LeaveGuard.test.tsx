import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Link, useLocation } from 'wouter';
import type { Profile, ProfileRequest } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { ProfileForm } from '../features/profile/ProfileForm';
import { useDirty } from './dirty';
import { LeaveGuard } from './LeaveGuard';

function Page({
  dirty,
  save,
}: {
  dirty: boolean;
  save?: () => Promise<boolean>;
}) {
  useDirty(dirty, save);
  const [path] = useLocation();
  return (
    <>
      <p data-testid="path">{path}</p>
      <Link href="/diary">Diary</Link>
    </>
  );
}

async function setup(dirty: boolean, save?: () => Promise<boolean>) {
  render(
    <I18nProvider>
      <LeaveGuard>
        <Page dirty={dirty} save={save} />
      </LeaveGuard>
    </I18nProvider>,
  );
  await screen.findByText('Diary');
}

const path = () => screen.getByTestId('path').textContent;
const dialog = () => screen.queryByRole('alertdialog');
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  history.replaceState(null, '', '/profile');
});
afterEach(cleanup);

describe('LeaveGuard', () => {
  it('leaves without asking when nothing is edited', async () => {
    await setup(false);
    fireEvent.click(screen.getByText('Diary'));
    expect(dialog()).toBeNull();
    expect(path()).toBe('/diary');
  });

  it('asks before a link with edits; Stay stays, Don’t save leaves', async () => {
    await setup(true);
    fireEvent.click(screen.getByText('Diary'));
    expect(dialog()).toBeTruthy();
    expect(document.activeElement).toBe(button('Stay'));
    fireEvent.click(button('Stay'));
    expect(dialog()).toBeNull();
    expect(path()).toBe('/profile');

    fireEvent.click(screen.getByText('Diary'));
    fireEvent.click(button('Don’t save'));
    expect(path()).toBe('/diary');
  });

  it('Save and leave saves first; a failed save stays', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await setup(true, save);
    fireEvent.click(screen.getByText('Diary'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(save).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(path()).toBe('/profile');

    fireEvent.click(screen.getByText('Diary'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(save).toHaveBeenCalledTimes(2);
    expect(path()).toBe('/diary');
  });

  it('puts the page back on «back» and asks', async () => {
    history.replaceState(null, '', '/');
    history.pushState(null, '', '/profile');
    await setup(true);
    act(() => history.back());
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(location.pathname).toBe('/profile');
    expect(path()).toBe('/profile');
    fireEvent.click(button('Don’t save'));
    expect(path()).toBe('/');
  });

  it('asks on closing the tab only while there are edits', async () => {
    const close = () => {
      const e = new Event('beforeunload', { cancelable: true });
      dispatchEvent(e);
      return e.defaultPrevented;
    };
    await setup(true);
    expect(close()).toBe(true);
    cleanup();
    expect(close()).toBe(false);
  });

  it('is wired to the profile: Save and leave saves the edited profile', async () => {
    const profile: Profile = {
      sex: 'male',
      birthDate: '1996-01-01',
      heightCm: 180,
      weightKg: 80,
      activity: 'moderate',
      goal: 'maintain',
      targetWeightKg: null,
      deadline: null,
    };
    const onSave = vi.fn(async (req: ProfileRequest) => ({
      ...req,
      rev: 2,
    }));
    render(
      <I18nProvider>
        <LeaveGuard>
          <ProfileForm
            initial={{ profile, manual: null, rev: 1 }}
            units="metric"
            today="2026-01-01"
            onSave={onSave}
          />
          <Page dirty={false} />
        </LeaveGuard>
      </I18nProvider>,
    );
    const weight = await screen.findByRole('textbox', { name: 'Weight' });
    fireEvent.focus(weight);
    fireEvent.change(weight, { target: { value: '90' } });
    fireEvent.blur(weight);
    fireEvent.click(screen.getByText('Diary'));
    await act(async () => fireEvent.click(button('Save and leave')));
    expect(onSave.mock.calls[0]?.[0].profile.weightKg).toBe(90);
    expect(path()).toBe('/diary');
  });
});
