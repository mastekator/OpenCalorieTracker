import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { Route, Router, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { MealNew } from './routes';

afterEach(cleanup);

describe('MealNew', () => {
  it('without a photo keeps the day on the way to the edit screen (AC-2.11)', async () => {
    const location = memoryLocation({
      path: '/meal/new?date=2026-11-10',
      record: true,
    });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Switch>
          <Route path="/meal/new">
            <MealNew />
          </Route>
          <Route>edit</Route>
        </Switch>
      </Router>,
    );
    await waitFor(() =>
      expect(location.history.at(-1)).toBe('/meal/new/edit?date=2026-11-10'),
    );
  });
});
