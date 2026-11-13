import { afterEach, describe, expect, it, vi } from 'vitest';
import { markDirty } from './dirty';
import { createUpdater, UPDATE_CHECK_INTERVAL } from './updater';

let time = 0;
let release = () => {};
const setup = (installing = false) => {
  time = 0;
  const sw = {
    apply: vi.fn(),
    check: vi.fn(async () => {}),
    installing: () => installing,
    reload: vi.fn(),
  };
  return { sw, updater: createUpdater(sw, () => time) };
};

afterEach(() => release());

describe('createUpdater', () => {
  it('only remembers a waiting version until the app becomes visible', () => {
    const { sw, updater } = setup();
    updater.needRefresh();
    expect(sw.apply).not.toHaveBeenCalled();
    updater.visible();
    expect(sw.apply).toHaveBeenCalledOnce();
  });

  it('does not apply while a screen has unsaved edits', () => {
    const { sw, updater } = setup();
    updater.needRefresh();
    release = markDirty();
    updater.visible();
    expect(sw.apply).not.toHaveBeenCalled();
    release();
    updater.visible();
    expect(sw.apply).toHaveBeenCalledOnce();
  });

  it('checks for a new version at most once an hour', () => {
    const { sw, updater } = setup();
    updater.visible();
    expect(sw.check).not.toHaveBeenCalled();
    time = UPDATE_CHECK_INTERVAL;
    updater.visible();
    time += UPDATE_CHECK_INTERVAL - 1;
    updater.visible();
    expect(sw.check).toHaveBeenCalledOnce();
  });

  it('on client_outdated applies a waiting version even with unsaved edits', async () => {
    const { sw, updater } = setup();
    updater.needRefresh();
    release = markDirty();
    await updater.outdated();
    expect(sw.apply).toHaveBeenCalledOnce();
  });

  it('on client_outdated reloads when no new version is found', async () => {
    const { sw, updater } = setup();
    await updater.outdated();
    expect(sw.check).toHaveBeenCalledOnce();
    expect(sw.reload).toHaveBeenCalledOnce();
  });

  it('on client_outdated waits for a version that is downloading', async () => {
    const { sw, updater } = setup(true);
    await updater.outdated();
    expect(sw.reload).not.toHaveBeenCalled();
    updater.needRefresh();
    expect(sw.apply).toHaveBeenCalledOnce();
  });
});
