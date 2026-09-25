import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { authSecret } from "./secrets";

/**
 * Encryption at rest for the third-party credentials on the User row: the Plex
 * server token, each person's plex.tv token, the Overseerr API key.
 *
 * Byte-compatible with the current app, which is the only reason it is here in
 * step 2: the copied database holds tokens it sealed, and the availability job
 * has to open them. Same prefix, same HKDF derivation from AUTH_SECRET, same
 * AES-256-GCM layout. Rows from before the vault are plaintext and pass through.
 *
 * A value that will not open (AUTH_SECRET rotated, row tampered with) comes back
 * null, which every consumer treats as "not connected" rather than an error.
 */

const PREFIX = "enc:v1:";
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function vaultKey(): Buffer {
  cachedKey ??= Buffer.from(hkdfSync("sha256", authSecret(), "trekker-token-vault", "aes-256-gcm", 32));
  return cachedKey;
}

export function sealSecret(plain: string): string {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64url");
}

export function openSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;

  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const nonce = raw.subarray(0, NONCE_LENGTH);
    const body = raw.subarray(NONCE_LENGTH, raw.length - TAG_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
