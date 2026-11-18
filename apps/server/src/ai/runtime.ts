import { createModel, type AiModel } from './model.js';
import type { AiSettings } from './settings.js';
import { setActiveModel } from './status.js';

export interface ActiveAi {
  settings: AiSettings;
  model: AiModel;
}

/**
 * Holder of the active model (ADR-0018 §3). Routes read current() in every request, so a request
 * started before apply() keeps its model to the end.
 */
export interface AiRuntime {
  current(): ActiveAi | null;
  /** `model`: one already built for these settings (by the check before saving). */
  apply(settings: AiSettings | null, model?: AiModel): Promise<void>;
}

export function createAiRuntime(initial: ActiveAi | null = null): AiRuntime {
  let active = initial;
  setActiveModel(active?.model ?? null);
  return {
    current: () => active,
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
