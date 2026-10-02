/** Thrown for failures that retrying won't fix, like a missing file. */
export class NonRetryableError extends Error {}

/**
 * Runs an async function, retrying on failure with increasing delays
 * (2s, 4s, ...). Gives up immediately on NonRetryableError.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NonRetryableError || attempt >= attempts) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`Attempt ${attempt} failed, retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
