import { afterEach, describe, expect, it } from 'vitest';
import type { MeResponse } from '@oct/shared';
import { openUserDb } from './db';
import { clearLocal, getLastUser, readOfflineUser, setLastUser } from './user';

const userA = { id: 1, email: 'a@example.com' } as MeResponse;
const userB = { id: 2, email: 'b@example.com' } as MeResponse;

/** What DataProvider does on sign-in: last user plus `me` in the user's own base. */
async function signIn(user: MeResponse) {
  setLastUser(user);
  const db = await openUserDb(user.id);
  await db.put('kv', user, 'me');
  await db.put('meals', { clientId: `meal-of-${user.id}` } as never);
  return db;
}

afterEach(async () => {
  await clearLocal(userA.id);
  await clearLocal(userB.id);
});

describe('user isolation (AC-2.7)', () => {
  it('A signs in, signs out, B signs in: nothing of A is left', async () => {
    await signIn(userA);
    // Sign-out with A's database still open: resolving at all means it closed itself.
    await clearLocal(userA.id);
    expect(getLastUser()).toBeNull();
    expect(await readOfflineUser()).toBeNull();

    (await signIn(userB)).close();
    expect(getLastUser()).toEqual({ id: 2, email: 'b@example.com' });
    expect(await readOfflineUser()).toEqual(userB);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('oct-1');
    const reopenedA = await openUserDb(userA.id);
    expect(await reopenedA.getAll('meals')).toEqual([]);
    reopenedA.close();
  });
});
