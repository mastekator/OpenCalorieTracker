import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AdminBlock, AdminUser, Invite } from '@oct/shared';
import { atPath } from '../../ui/navStory';
// The screens reuse the settings layout; the app always loads its CSS.
import '../settings/settings.css';
import { ToastProvider } from '../../ui/Toast/Toast';
import { BlocksScreen } from './BlocksScreen';
import { InvitesScreen, NewInviteSheet } from './InvitesScreen';
import { LinkReadySheet } from './LinkReadySheet';
import { UserSheet, UsersScreen } from './UsersScreen';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const invites: Invite[] = [
  {
    id: 1,
    email: 'maria@example.com',
    createdAt: now - DAY,
    expiresAt: now + 6 * DAY,
    usedAt: null,
    revokedAt: null,
    status: 'pending',
  },
  {
    id: 2,
    email: 'oleg@example.com',
    createdAt: now - 9 * DAY,
    expiresAt: now - 2 * DAY,
    usedAt: now - 8 * DAY,
    revokedAt: null,
    status: 'used',
  },
  {
    id: 3,
    email: 'old@example.com',
    createdAt: now - 60 * DAY,
    expiresAt: now - 53 * DAY,
    usedAt: null,
    revokedAt: null,
    status: 'expired',
  },
];
const users: AdminUser[] = [
  {
    id: 1,
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    createdAt: now - 90 * DAY,
    lastLoginAt: now,
  },
  {
    id: 2,
    email: 'maria@example.com',
    name: 'Maria',
    role: 'user',
    createdAt: now - 30 * DAY,
    lastLoginAt: now - DAY,
  },
  {
    id: 3,
    email: 'oleg@example.com',
    name: null,
    role: 'user',
    createdAt: now - 8 * DAY,
    lastLoginAt: null,
  },
];
const blocks: AdminBlock[] = [
  {
    id: 1,
    kind: 'device',
    ip: '203.0.113.7',
    device: 'iPhone · Safari',
    blockedAt: now - DAY,
    failCount: 10,
    lastEmail: 'maria@example.com',
  },
  {
    id: 2,
    kind: 'ip',
    ip: '198.51.100.23',
    device: null,
    blockedAt: now - 3 * DAY,
    failCount: 30,
    lastEmail: null,
  },
];

/** Answers GETs by path; `null` answers 500 (the error state). Writes succeed empty. */
const serve = (body: unknown) => () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (_, init) =>
    init?.method && init.method !== 'GET'
      ? new Response(null, { status: 204 })
      : body === null
        ? Response.json({ error: { code: 'internal' } }, { status: 500 })
        : Response.json(body);
  return () => {
    globalThis.fetch = real;
  };
};

/** Admin, OCT-13 §7 (4.1–4.6). Theme and language: toolbar; Dark stories below. */
const meta = {
  title: 'Admin/Screens',
  decorators: [
    atPath,
    (Story) => (
      <ToastProvider>
        <div className="screen__body">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 4.1 Invites: pending, the last 30 days, «Show all». */
export const Invites: Story = {
  beforeEach: serve(invites),
  render: () => <InvitesScreen />,
};
export const InvitesDark: Story = { ...Invites, ...dark };
export const InvitesEmpty: Story = {
  beforeEach: serve([]),
  render: () => <InvitesScreen />,
};
export const InvitesEmptyDark: Story = { ...InvitesEmpty, ...dark };
export const InvitesError: Story = {
  beforeEach: serve(null),
  render: () => <InvitesScreen />,
};
export const InvitesErrorDark: Story = { ...InvitesError, ...dark };

/** 4.2 New invite; the email already has a pending invite. */
export const NewInvite: Story = {
  render: () => (
    <NewInviteSheet
      pending={invites.slice(0, 1)}
      onClose={() => {}}
      onCreated={() => {}}
    />
  ),
};
export const NewInviteDark: Story = { ...NewInvite, ...dark };

const linkReady = () => (
  <LinkReadySheet
    url="https://calories.example.com/invite#9f2c1d7a4b6e8f0a"
    body="For maria@example.com. Valid for 7 days, until 22 Nov. Save it now — you won’t be able to see it again."
    onClose={() => {}}
  />
);
/** 4.3 Link ready with navigator.share: «Share» primary. */
export const LinkReadyShare: Story = {
  beforeEach: () => {
    const real = navigator.share;
    navigator.share = async () => {};
    return () => {
      navigator.share = real;
    };
  },
  render: linkReady,
};
export const LinkReadyShareDark: Story = { ...LinkReadyShare, ...dark };
/** 4.3 Without navigator.share (desktop): «Copy» becomes primary. */
export const LinkReadyCopy: Story = {
  beforeEach: () => {
    const real = navigator.share;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    return () => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: real,
      });
    };
  },
  render: linkReady,
};
export const LinkReadyCopyDark: Story = { ...LinkReadyCopy, ...dark };

/** 4.4 Users: one's own row has no chevron. */
export const Users: Story = {
  beforeEach: serve(users),
  render: () => <UsersScreen selfId={1} />,
};
export const UsersDark: Story = { ...Users, ...dark };
const desktop = { viewport: { value: 'desktop' } };
const longUsers: AdminUser[] = [
  ...users,
  {
    id: 4,
    email: 'maria.konstantinopolskaya.family-account@subdomain.example.com',
    name: 'Maria Konstantinopolskaya-Rimskaya',
    role: 'user',
    createdAt: now - 2 * DAY,
    lastLoginAt: now - DAY,
  },
];
/** OCT-229: one column the width of the screen (.screen); a long email breaks only where it must. */
export const UsersDesktop: Story = {
  beforeEach: serve(longUsers),
  render: () => (
    <div className="screen">
      <UsersScreen selfId={1} />
    </div>
  ),
  globals: desktop,
};
export const UsersDesktopDark: Story = {
  ...UsersDesktop,
  globals: { ...desktop, theme: 'dark' },
};
export const UsersLongEmail: Story = {
  beforeEach: serve(longUsers),
  render: () => <UsersScreen selfId={1} />,
};
export const UsersLongEmailDark: Story = { ...UsersLongEmail, ...dark };
/** 4.5 A user's sheet. */
export const User: Story = {
  render: () => (
    <UserSheet user={users[1]!} onClose={() => {}} onDelete={() => {}} />
  ),
};
export const UserDark: Story = { ...User, ...dark };

/** 4.6 Blocks: a device and a whole address. */
export const Blocks: Story = {
  beforeEach: serve(blocks),
  render: () => <BlocksScreen />,
};
export const BlocksDark: Story = { ...Blocks, ...dark };
export const BlocksEmpty: Story = {
  beforeEach: serve([]),
  render: () => <BlocksScreen />,
};
export const BlocksEmptyDark: Story = { ...BlocksEmpty, ...dark };
