import { stableStringify as stableStringifyInternal } from "@syncore/internal";

/**
 * Serialize JSON-like values with stable object key ordering.
 *
 * Unlike `JSON.stringify`, object keys are sorted recursively so semantically
 * equivalent values produce the same string. Cycles and bigint values are not
 * supported and throw clear `TypeError`s.
 */
export function stableStringify(value: unknown): string {
  return stableStringifyInternal(value);
}
