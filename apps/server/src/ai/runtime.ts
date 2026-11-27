import type { Database } from 'better-sqlite3';
import { isLocalAiHost, providerKey, type AiSource } from '@oct/shared';
import type { User } from '../auth/session.js';
import type { Config } from '../config.js';
import type { Secrets } from '../secrets.js';
import { createModel, type AiModel } from './model.js';
import { ownAiRow, ownModel } from './own.js';
import { userKeysAllowed, type AiSettings } from './settings.js';
import { markOwnModel, setActiveModel } from './status.js';

export interface ActiveAi {
  settings: AiSettings;
  model: AiModel;
}

/** The model for one user's data (ADR-0031 §1), with what their consent is checked against. */
export interface ResolvedAi {
  settings: Omit<AiSettings, 'source'>;
  source: AiSource;
  providerKey: string;
  /** In the admin's network: no consent is asked (ADR-0031 §5). */
  local: boolean;
  /** The model itself; an own key's is built anew on every call (ADR-0031 §2). */
  build(): Promise<AiModel>;
}

/**
 * Holder of the active model (ADR-0018 §3). Routes read current() in every request, so a request
 * started before apply() keeps its model to the end.
 */
export interface AiRuntime {
  /** Admin checks, model list and model test only: no user data goes there. */
  current(): ActiveAi | null;
  /** Every route that sends a user's data to the model takes it here (ADR-0031 §1). */
  /** Without a role, an own key's address is guarded as a non-admin's. */
  forUser(user: { id: number; role?: User['role'] }): ResolvedAi | null;
  /** `model`: one already built for these settings (by the check before saving). */
  apply(settings: AiSettings | null, model?: AiModel): Promise<void>;
}

export function createAiRuntime(
  { db, secrets, config }: { db: Database; secrets: Secrets; config: Config },
  initial: ActiveAi | null = null,
): AiRuntime {
  let active = initial;
  setActiveModel(active?.model ?? null);
  return {
    current: () => active,
    forUser(user) {
      // An unreadable key (another secret.key) falls back to the server's model.
      const own = userKeysAllowed(db, config)
        ? ownAiRow(db, secrets, user.id)
        : null;
      if (own && !own.keyUnreadable)
        return {
          settings: own,
          source: 'own_key',
          providerKey: providerKey(own),
          local: false,
          async build() {
            const model = await ownModel(user, own);
            markOwnModel(model, user.id);
            return model;
          },
        };
      if (!active) return null;
      const { settings, model } = active;
      return {
        settings,
        source: 'server',
        providerKey: providerKey(settings),
        local:
          settings.provider === 'openai-compatible' &&
          isLocalAiHost(settings.baseUrl ?? ''),
        build: async () => model,
      };
    },
    async apply(settings, built) {
      let model: AiModel | null = null;
      // Broken AI settings must not take the server down: it falls back to manual mode.
      try {
        model = built ?? (await createModel(settings));
      } catch (err) {
        console.error(
          `[setup] AI model could not be created (${(err as Error).name}); AI is off.`,
        );
      }
      active = settings && model ? { settings, model } : null;
      setActiveModel(model);
    },
  };
}
