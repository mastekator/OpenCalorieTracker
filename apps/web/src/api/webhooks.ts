import { z } from 'zod';
import {
  createdWebhookSchema,
  webhookDeliverySchema,
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

/** A new signing secret, shown once; the old one stops verifying at once. */
export const rotateWebhookSecret = (id: number) =>
  api(`/api/webhooks/${id}/secret`, createdWebhookSchema, { method: 'POST' });

/** Sends a `test` event now and answers with its log row. */
export const testWebhook = (id: number) =>
  api(`/api/webhooks/${id}/test`, webhookDeliverySchema, { method: 'POST' });

/** The last MAX_WEBHOOK_DELIVERIES deliveries, newest first. */
export const listDeliveries = (id: number) =>
  api(`/api/webhooks/${id}/deliveries`, z.array(webhookDeliverySchema));

export const deleteWebhook = (id: number) =>
  api(`/api/webhooks/${id}`, z.undefined(), { method: 'DELETE' });
