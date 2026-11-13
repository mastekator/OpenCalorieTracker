import type { RecognitionStatus } from '@oct/shared';
import type { AiModel } from './model.js';

// Learned from the first failed call (ADR-0007); kept until restart.
let vision = true;

export function markNoVision() {
  vision = false;
}

export function recognitionStatus(model: AiModel | null): RecognitionStatus {
  if (!model) return 'not_configured';
  return vision ? 'ready' : 'no_vision';
}
