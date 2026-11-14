import type { ErrorCode } from '@oct/shared';

// Source and fallback dictionary: keys and their types come from here (ADR-0004).
// A plural is an object with an `other` key plus the categories the language uses.
export const en = {
  common: {
    appName: 'OpenCalorieTracker',
    loading: 'Loading…',
    close: 'Close',
    cancel: 'Cancel',
    got_it: 'Got it',
    retry: 'Try again',
    tryAgainIn: {
      one: 'Try again in {count} minute',
      other: 'Try again in {count} minutes',
    },
  },
  screens: {
    login: 'Sign in',
    invite: 'Accept invitation',
    recover: 'Recover access',
    register: 'Create account',
  },
  auth: {
    email: 'Email',
    email_ph: 'name@example.com',
    password: 'Password',
    show_password: 'Show password',
    hide_password: 'Hide password',
    passkey: 'Sign in with passkey',
    or_password: 'or with password',
    submit: 'Sign in',
    loading: 'Signing in…',
    forgot: 'Forgot password?',
    lost_access: 'Lost access?',
    no_account: 'No account?',
    create: 'Create account',
    session_expired: 'Your session expired. Please sign in again',
    offline: 'You need an internet connection to sign in',
    err: {
      timeout: {
        title: 'Too many attempts',
        body: 'Password sign-in on this device reopens in {n} min. Passkey still works.',
        body_password_only:
          'Password sign-in on this device reopens in {n} min.',
      },
      blocked: {
        title: 'Password sign-in is blocked on this device',
        body: 'Ask your admin to unblock it. Passkey still works.',
        body_password_only: 'Ask your admin to unblock it.',
      },
      no_passkey: {
        title: 'No passkey on this device',
        body_password:
          'Sign in with your password or from a device that has your passkey.',
        body_passkey_only:
          'Sign in from a device that has it, or ask your admin for a recovery link.',
      },
      passkey_revoked: 'This passkey no longer works. Sign in another way.',
    },
    forgot_sheet: {
      title: 'Forgot your password?',
      body: 'This app doesn’t send emails. Ask the admin of this installation for a recovery link — you can use it to set a new password or create a passkey. Your diary stays intact.',
    },
  },
  setup: {
    wrong_origin: {
      title: 'Open the app at its address',
      body: 'Passkey sign-in only works at the address set during installation.',
      cta: 'Open {host}',
    },
    not_configured: {
      title: 'Installation isn’t set up',
      admin:
        'Set the admin account in the container configuration. See the README.',
      url: 'Set PUBLIC_URL in the container configuration. See the README.',
    },
  },
  settings: { logout: 'Sign out' },
  logout: {
    confirm: {
      title: 'Sign out?',
      body_unsaved: 'Unsaved changes will be lost.',
    },
  },
  link_ready: { share: 'Share', copied: 'Link copied' },
  reg: {
    name: 'Your name',
    method: {
      title: 'Sign-in method',
      passkey: 'Passkey',
      password: 'Password',
    },
  },
  form: { err: { email: 'Enter an email, like name@example.com' } },
  pw: {
    rule: {
      length: 'At least {min} characters',
      letter_digit: 'A letter and a number',
      symbol: 'A symbol, like ! - _ or a space',
      not_email: 'Not the same as your email',
    },
  },
  offline: {
    bar: 'Offline · data from {time}',
    no_network: 'No connection',
    server_down: 'Server unavailable',
  },
  nav: {
    main: 'Main menu',
    today: 'Today',
    diary: 'Diary',
    week: 'Week',
    profile: 'Profile',
    settings: 'Settings',
    add_food: 'Add food',
    take_photo: 'Take a photo of food',
  },
  update: {
    stale: 'The app has been updated · please save again',
  },
  errors: {
    validation_failed: 'Check the highlighted fields',
    unauthenticated: 'Please sign in',
    invalid_credentials: 'Incorrect email or password',
    method_disabled: 'This sign-in method is turned off on this server',
    passkey_unknown: 'This passkey isn’t registered on this server',
    passkey_failed: 'Couldn’t verify the passkey. Try again',
    last_sign_in_method: 'You can’t remove your only way to sign in',
    password_invalid: 'The password doesn’t meet the rules',
    password_too_common: 'This password is too common. Choose another',
    forbidden: 'You don’t have access to this',
    not_found: 'Not found',
    email_taken: 'This email is already registered',
    invite_used: 'This invitation has already been used',
    invite_invalid: 'This link is invalid or has been revoked',
    invite_expired: 'This link has expired',
    registration_failed: 'Could not create an account with these details',
    too_many_attempts: 'Too many attempts. Try again later',
    device_blocked: 'Sign-in from this device is temporarily blocked',
    ip_blocked: 'Sign-in from this network is temporarily blocked',
    not_configured: 'This feature isn’t set up on the server',
    ai_not_configured: 'AI recognition isn’t set up. Enter the meal manually',
    ai_no_vision: 'The configured AI model can’t read photos',
    ai_quota_exceeded: 'The AI provider’s limit is reached. Try later',
    ai_unavailable: 'The AI provider is unavailable. Try later',
    ai_invalid_response: 'The AI returned an unreadable answer. Try again',
    photo_too_large: 'The photo is too large',
    photo_invalid: 'This file isn’t a photo we can read',
    client_outdated: 'The app has been updated. Please save again',
    photo_expired: 'The full photo is no longer stored. Take a new one',
    payload_too_large: 'The request is too large',
    photo_in_use: 'This photo is already attached to another meal',
    agent_not_ready: 'Finish the dialog up to the summary first',
    agent_closed: 'This dialog is closed. Use the form or start over',
    cannot_delete_self: 'You cannot delete your own account here',
    internal: 'Something went wrong. Try again',
  } satisfies Record<ErrorCode, string>,
};
