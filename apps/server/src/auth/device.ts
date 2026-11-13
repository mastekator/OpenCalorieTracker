import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Config } from '../config.js';
import { cookieOptions, type AuthEnv } from './session.js';

const COOKIE = 'oct_device';
/** The longest lifetime browsers keep a cookie. */
const MAX_AGE = 400 * 24 * 60 * 60;
// Exactly what newDeviceId() produces; anything else is treated as no cookie.
const VALID = /^[\w-]{22}$/;

const setDevice = (c: Context, config: Config, id: string) =>
  setCookie(c, COOKIE, id, { ...cookieOptions(config), maxAge: MAX_AGE });

/**
 * The brute-force guard's device key (AC-5.6). Sets `c.var.deviceId` only for a cookie the client
 * sent back, so a request without one counts against its IP alone (AC-5.8a).
 */
export const device = (config: Config) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const id = getCookie(c, COOKIE);
    if (id && VALID.test(id)) c.set('deviceId', id);
    else setDevice(c, config, randomBytes(16).toString('base64url'));
    await next();
  });

/** Extends the device cookie on sign-in. */
export function renewDevice(c: Context<AuthEnv>, config: Config) {
  if (c.var.deviceId) setDevice(c, config, c.var.deviceId);
}
