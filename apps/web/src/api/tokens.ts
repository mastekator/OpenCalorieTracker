import { z } from 'zod';
import {
  apiTokenSchema,
  createdApiTokenSchema,
  type CreateApiTokenRequest,
} from '@oct/shared';
import { api } from './client';

/** Session-only management of personal API tokens (ADR-0027 §1). */
export const listTokens = () => api('/api/tokens', z.array(apiTokenSchema));

/** The answer carries the token itself: the only time it is shown (AC-5.1). */
export const createToken = (body: CreateApiTokenRequest) =>
  api('/api/tokens', createdApiTokenSchema, { method: 'POST', body });

export const deleteToken = (id: number) =>
  api(`/api/tokens/${id}`, z.undefined(), { method: 'DELETE' });

export const deleteAllTokens = () =>
  api('/api/tokens', z.undefined(), { method: 'DELETE' });
