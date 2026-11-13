import { validator } from 'hono/validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { ApiError } from './errors.js';

/** `validate('json', schema)`: parses the target with zod or throws 400 validation_failed. */
export const validate = <
  T extends z.ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  validator(target, (value): z.output<T> => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const details = result.error.issues.map(({ path, code }) => ({
      path,
      code,
    }));
    throw new ApiError(400, 'validation_failed', details);
  });
