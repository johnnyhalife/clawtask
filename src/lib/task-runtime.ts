/** Canonical Gateway thinking values, not provider capability guarantees. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max', 'ultra'] as const;
export interface TaskRuntime { modelOverride: string | null; thinkingOverride: string | null }

/** Omission preserves a value on PATCH; explicit null restores agent defaults. */
export function validateTaskRuntime(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Task body must be an object';
  if ('modelOverride' in body && body.modelOverride !== null) {
    const value = body.modelOverride;
    // Require an unambiguous provider/model reference; no aliases or auth-profile selectors.
    if (typeof value !== 'string' || value.length > 256 || /\s/.test(value) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._:-]*)*$/.test(value)) {
      return 'modelOverride must be null or a provider/model reference (1–256 characters, no whitespace)';
    }
  }
  if ('thinkingOverride' in body && body.thinkingOverride !== null &&
      (typeof body.thinkingOverride !== 'string' || !THINKING_LEVELS.includes(body.thinkingOverride as typeof THINKING_LEVELS[number]))) {
    return 'thinkingOverride must be null or one of: ' + THINKING_LEVELS.join(', ');
  }
  return null;
}
