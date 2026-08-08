import { beforeAll, describe, expect, it } from "vitest";
import { resetSecretCache } from "@/lib/secrets";
import { openSecret, resetVaultKey, sealSecret } from "@/lib/token-vault";

/**
 * The vault's whole contract is four sentences: what goes in comes back out,
 * legacy plaintext passes through, damage reads as absence, and nothing about
 * the stored form gives the plaintext away. Each is pinned here because every
 * Plex and Overseerr call in the app now stands on them.
 */

/** Both caches: the resolved secret string, and the key derived from it. */
function rekey(secret: string) {
  process.env.AUTH_SECRET = secret;
  resetSecretCache();
  resetVaultKey();
}

beforeAll(() => {
  rekey("a-test-secret-long-enough-to-be-taken-seriously");
});

describe("sealSecret / openSecret", () => {
  it("round-trips a token exactly", () => {
    const token = "xyzzy-PLEX-token_1234";
    expect(openSecret(sealSecret(token))).toBe(token);
  });

  it("stores nothing recognisable, and never the same thing twice", () => {
    const token = "super-secret-api-key";
    const sealed = sealSecret(token);

    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain(token);
    // A fresh nonce per call: two seals of the same value must not be
    // comparable, or the database would reveal which accounts share a token.
    expect(sealSecret(token)).not.toBe(sealed);
  });

  it("passes a pre-vault plaintext row through unchanged", () => {
    expect(openSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });

  it("treats nothing as nothing", () => {
    expect(openSecret(null)).toBeNull();
    expect(openSecret(undefined)).toBeNull();
    expect(openSecret("")).toBeNull();
  });

  it("reads damage as absence rather than throwing", () => {
    const sealed = sealSecret("about-to-be-mangled");

    // Flip a character in the ciphertext: GCM's tag check must refuse it.
    const mangled =
      sealed.slice(0, sealed.length - 2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(openSecret(mangled)).toBeNull();

    // Not base64 at all after the prefix.
    expect(openSecret("enc:v1:!!!not-base64!!!")).toBeNull();
  });

  it("reads a seal under a rotated secret as absence", () => {
    const sealed = sealSecret("sealed-under-the-old-secret");

    rekey("a-different-secret-also-long-enough-to-count");
    expect(openSecret(sealed)).toBeNull();

    // Back to the original for any test that runs after this one.
    rekey("a-test-secret-long-enough-to-be-taken-seriously");
  });
});
