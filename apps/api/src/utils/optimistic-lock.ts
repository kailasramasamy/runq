import { ConflictError } from './errors';

/**
 * Validates that the record hasn't been modified since it was last read.
 * Call this before updating financial records.
 */
export function checkVersion(currentUpdatedAt: Date, expectedUpdatedAt: string | Date): void {
  const current = new Date(currentUpdatedAt).getTime();
  const expected = new Date(expectedUpdatedAt).getTime();
  if (Math.abs(current - expected) > 1000) { // 1 second tolerance
    throw new ConflictError('Record was modified by another user. Please refresh and try again.');
  }
}
