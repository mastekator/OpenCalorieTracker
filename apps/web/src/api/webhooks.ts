import { z } from 'zod';
import {
  createdWebhookSchema,
  webhookSchema,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
} from '@oct/shared';
import { api } from './client';

/** Session-only management of the user's webhooks (ADR-0027 §3). */
export const listWebhooks = () => api('/api/webhooks', z.array(webhookSchema));

/** The answer carries the signing secret: the only time it is shown. */
export const createWebhook = (body: CreateWebhookRequest) =>
  api('/api/webhooks', createdWebhookSchema, { method: 'POST', body });

export const updateWebhook = (id: number, body: UpdateWebhookRequest) =>
  api(`/api/webhooks/${id}`, webhookSchema, { method: 'PATCH', body });
