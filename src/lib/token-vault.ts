import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { authSecret } from "./secrets";

/**
 * Encryption at rest for the third-party credentials on the User row — the
 * Plex server token, each person's plex.tv token, the Overseerr API key.
 *
 * The database file *is* the deployment (one SQLite file, backed up whole), so
 * these secrets travel with every backup and every copy of `dev.db` somebody
 * shares to debug a problem. Sealed, a leaked database file costs the watch
 * history it holds; it no longer also hands over the keys to the media server.
 *
 * The key is derived from AUTH_SECRET, which is the one secret a deployment is
 * already required to have — a second key to manage would mostly get set to
 * the first one anyway. The honest consequence: rotating AUTH_SECRET, which
 * already signs everyone out, now also forgets the stored server connections,
 * and everything opens as null — "not connected" — rather than throwing. A
 * relink is the fix, and the settings page already says what is not connected.
 *
 * Rows written before this existed are plaintext. `openSecret` passes them
 * through unchanged, and they become sealed the next time they are saved —
 * there is no migration, because a migration would need the key at migrate
 * time and `prisma migrate deploy` runs before the app is up.
 */

const PREFIX = "enc:v1:";

/** AES-256-GCM: 12-byte nonce in front, 16-byte tag on the end. */
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function vaultKey(): Buffer {
  if (!cachedKey) {
    // HKDF rather than the secret directly: AUTH_SECRET also signs sessions,
    // and one secret in two roles should at least be two derived keys.
    cachedKey = Buffer.from(
      hkdfSync("sha256", authSecret(), "trekker-token-vault", "aes-256-gcm", 32),
    );
  }
  return cachedKey;
}

/** Seals a credential for storage. Every call gets a fresh nonce. */
export function sealSecret(plain: string): string {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64url");
}

/**
 * Opens a stored credential.
 *
 * A value without the prefix predates the vault and is returned as it is; a
 * sealed value that will not open — AUTH_SECRET rotated, or the row tampered
 * with — comes back null, which every consumer already treats as "not
 * connected". Failing soft here is what keeps a secret rotation an
 * inconvenience rather than an outage.
 */
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

/** Test seam: the derived key is cached per process. */
export function resetVaultKey() {
  cachedKey = null;
}
