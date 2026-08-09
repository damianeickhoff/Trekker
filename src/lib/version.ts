import "server-only";

/**
 * Which build this is.
 *
 * Stamped into the image by the publish workflow as the commit it was built
 * from — see the `TREKKER_VERSION` arg in the `Dockerfile`. Read at run time
 * rather than inlined at build time, which is what lets the same built output
 * carry a different answer and what keeps the value out of the client bundle
 * until something deliberately passes it there.
 *
 * It exists because "did the update actually apply?" had no answer inside the
 * app. Unraid's own update check compares image digests and had already been
 * caught claiming there was nothing new when there was; a number the running
 * instance reports about itself is the thing that settles it either way.
 */

/** A full git commit, which is what CI supplies. */
const SHA = /^[0-9a-f]{40}$/i;

export function buildVersion(): string {
  const stamped = process.env.TREKKER_VERSION?.trim();
  if (!stamped) return "dev";

  // Shortened to the same seven characters the `sha-<short>` image tag uses, so
  // what the app says can be found in the registry without translating it.
  return SHA.test(stamped) ? stamped.slice(0, 7) : stamped;
}
