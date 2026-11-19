import { PUBLIC_KEY_PREFIX } from "@askwell/shared";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_LENGTH = 32;
// Largest multiple of 62 that fits in a byte. Bytes at or above it are skipped, so every
// character is equally likely (no modulo bias).
const UNBIASED_MAX = 256 - (256 % ALPHABET.length);

/** A new project public key: `pk_` + 32 random base62 characters (project.md §6.3). */
export function generatePublicKey(): string {
  let key = "";
  while (key.length < KEY_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH * 2));
    for (const byte of bytes) {
      if (byte >= UNBIASED_MAX) continue;
      key += ALPHABET[byte % ALPHABET.length];
      if (key.length === KEY_LENGTH) break;
    }
  }
  return `${PUBLIC_KEY_PREFIX}${key}`;
}
