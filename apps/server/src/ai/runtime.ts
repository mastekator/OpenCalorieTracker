import { isLocalAiHost, providerKey, type AiSource } from '@oct/shared';
import { createModel, type AiModel } from './model.js';
import type { AiSettings } from './settings.js';
import { setActiveModel } from './status.js';

export interface ActiveAi {
  settings: AiSettings;
  model: AiModel;
}

/** The model for one user's data (ADR-0031 §1), with what their consent is checked against. */
export interface ResolvedAi extends ActiveAi {
  source: AiSource;
  providerKey: string;
  /** In the admin's network: no consent is asked (ADR-0031 §5). */
  local: boolean;
}

/**
 * Holder of the active model (ADR-0018 §3). Routes read current() in every request, so a request
 * started before apply() keeps its model to the end.
 */
export interface AiRuntime {
  /** Admin checks, model list and model test only: no user data goes there. */
  current(): ActiveAi | null;
  /** Every route that sends a user's data to the model takes it here (ADR-0031 §1). */
  forUser(user: { id: number }): ResolvedAi | null;
  /** `model`: one already built for these settings (by the check before saving). */
  apply(settings: AiSettings | null, model?: AiModel): Promise<void>;
}

export function createAiRuntime(initial: ActiveAi | null = null): AiRuntime {
  let active = initial;
  setActiveModel(active?.model ?? null);
  return {
    current: () => active,
    // shortcut: always the server's model until own keys come (OCT-484).
    forUser: () =>
      active && {
        ...active,
        source: 'server',
        providerKey: providerKey(active.settings),
        local:
          active.settings.provider === 'openai-compatible' &&
          isLocalAiHost(active.settings.baseUrl ?? ''),
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
