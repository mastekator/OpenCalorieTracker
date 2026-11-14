import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { List, ListRow } from './List';

afterEach(cleanup);

describe('ListRow', () => {
  it('is a button with onClick, a link with href, plain text otherwise', () => {
    render(
      <List title="Group">
        <ListRow onClick={() => {}}>Action</ListRow>
        <ListRow href="/invites">Invites</ListRow>
        <ListRow value="1.0">Version</ListRow>
      </List>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Invites' }).getAttribute('href'),
    ).toBe('/invites');
    expect(screen.queryAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('stays focusable when disabled and does not navigate', () => {
    const onClick = vi.fn();
    render(
      <List>
        <ListRow href="/invites" disabled onClick={onClick}>
          Invites
        </ListRow>
      </List>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledOnce(); // the screen can explain why (toast)
  });

  it('accent action row has no chevron; description renders under the label', () => {
    const { container } = render(
      <List>
        <ListRow onClick={() => {}} accent>
          Add
        </ListRow>
        <ListRow description="Created today">iPhone</ListRow>
      </List>,
    );
    expect(container.querySelector('.list-row__chevron')).toBeNull();
    expect(screen.getByText('Created today')).toBeTruthy();
  });
});
