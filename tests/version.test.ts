import { afterEach, describe, expect, it } from "vitest";
import { buildVersion } from "@/lib/version";

/**
 * The build stamp exists to answer "is this container running what I merged?",
 * so the case worth pinning is the one nobody looks at: an image built by hand,
 * where nothing stamped it. A version line reading `undefined` would be worse
 * than none at all, since the whole point of it is being believed.
 */

const original = process.env.TREKKER_VERSION;

afterEach(() => {
  if (original === undefined) delete process.env.TREKKER_VERSION;
  else process.env.TREKKER_VERSION = original;
});

describe("buildVersion", () => {
  it("shortens a commit to the seven characters the image tag uses", () => {
    process.env.TREKKER_VERSION = "6aa9ecf298721f1914f9bb9ed63684febe6277d9";
    expect(buildVersion()).toBe("6aa9ecf");
  });

  it("leaves anything that is not a commit alone", () => {
    // A `v*` tag build stamps the release, and cutting that to seven characters
    // would turn v1.10.0 into something that reads like a different version.
    process.env.TREKKER_VERSION = "v1.10.0";
    expect(buildVersion()).toBe("v1.10.0");
  });

  it("says dev when nothing stamped it", () => {
    delete process.env.TREKKER_VERSION;
    expect(buildVersion()).toBe("dev");

    // Docker will happily set an arg to the empty string.
    process.env.TREKKER_VERSION = "   ";
    expect(buildVersion()).toBe("dev");
  });
});
