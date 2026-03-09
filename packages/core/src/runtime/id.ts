/**
 * Generate a random UUID v4 string.
 *
 * Prefers `crypto.randomUUID()` when available (secure contexts, Node 19+,
 * web workers). Falls back to building a v4 UUID from
 * `crypto.getRandomValues()` for non-secure contexts such as `http://`
 * dev servers.
 */
export function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback: build a UUID v4 from getRandomValues.
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}
