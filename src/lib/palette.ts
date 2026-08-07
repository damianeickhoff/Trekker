import "server-only";
import sharp from "sharp";

/**
 * The two colours a title page's hero is built between.
 *
 * `edge` is the artwork's own bottom, at full strength. It is where the image
 * stops, so it is what the page has to be at that exact point — anything else is
 * a step, and a step is the line you can see. On a dark film the step was small
 * enough to miss; on a bright one it was the width of the screen.
 *
 * `tint` is the same colour taken down to something a page can be: artwork
 * averages are far too bright to put white text on. The hero runs a gradient
 * from one to the other over its lower half, so the artwork's own colour is what
 * carries on beneath it and the darkening happens gradually, in the open, rather
 * than all at once at an edge.
 *
 * The bottom third rather than the whole image: the average of a full frame is
 * the average of a sky and a shadow, and lands on grey more often than on
 * anything the film looks like.
 */

/** How much of the image counts as "the bottom". */
const STRIP = 0.34;

/**
 * How much of the sampled colour survives into the page's own background.
 *
 * The ceiling on this is legibility, not taste: the page carries white text, and
 * the brightest artwork there is has to leave enough contrast under it. At 0.44
 * a near-white frame lands near #706e66, which still measures about 5:1 against
 * white — enough, but not by much. There is very little room left above this
 * figure, so raise it with a bright film on screen rather than a dark one.
 */
const STRENGTH = 0.44;
const BASE = { r: 7, g: 7, b: 12 };

export type HeroColours = {
  /** The artwork's bottom edge, as it actually is. */
  edge: string;
  /** The same, dark enough to be a page. */
  tint: string;
};

/**
 * Per-process, and unbounded on purpose: the key is a TMDB path and the value
 * seven bytes, so a server that has served every film ever made is holding a
 * few megabytes. The image fetch behind it is cached by Next as well, but the
 * decode is not, and that is the part worth not repeating.
 */
const memo = new Map<string, HeroColours | null>();

export async function heroColours(
  path: string | null | undefined,
): Promise<HeroColours | null> {
  if (!path) return null;

  const hit = memo.get(path);
  if (hit !== undefined) return hit;

  const colours = await sample(path);
  memo.set(path, colours);
  return colours;
}

async function sample(path: string): Promise<HeroColours | null> {
  try {
    // The smallest size TMDB offers that still has colour worth averaging.
    const response = await fetch(`https://image.tmdb.org/t/p/w300${path}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) return null;

    const image = sharp(Buffer.from(await response.arrayBuffer()));
    const { width, height } = await image.metadata();
    if (!width || !height) return null;

    const strip = Math.max(1, Math.round(height * STRIP));

    // Down to a single pixel: `resize` to 1×1 is an average of everything in
    // the box, which is the figure being asked for.
    const { data } = await image
      .extract({ left: 0, top: height - strip, width, height: strip })
      .resize(1, 1, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const [r, g, b] = data;
    if (r === undefined || g === undefined || b === undefined) return null;

    return {
      edge: hex(r, g, b),
      tint: hex(mix(r, BASE.r), mix(g, BASE.g), mix(b, BASE.b)),
    };
  } catch {
    // A title with no usable artwork falls back to the app's own background,
    // which is what a null means to the caller. Never worth failing a page for.
    return null;
  }
}

function mix(value: number, base: number) {
  return Math.round(value * STRENGTH + base * (1 - STRENGTH));
}

function hex(...channels: number[]) {
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
