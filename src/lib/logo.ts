/**
 * The Trekker mark, as geometry rather than a file.
 *
 * `public/trekker_logo.svg` is the artwork as it was drawn — Figma export,
 * drop shadows and all. Those shadows are why this exists separately: they are
 * `feGaussianBlur` at 3% opacity, invisible at any size an icon is actually
 * seen at, and `ImageResponse` has to rasterise every one of them. What is kept
 * here is the silhouette, which is the part that has to survive being drawn at
 * 16px.
 *
 * One copy, shared by the header mark, the Apple icon and the iOS splash. The
 * two static files that cannot import it — `public/icon.svg`, `src/app/icon.svg`
 * — and `public/boot.html`, which is deliberately self-contained, carry their
 * own copies; change one and change those.
 */

/** The artwork's own box. The mark is drawn centred in it, so it can be nested. */
export const MARK_VIEWBOX = "0 0 533 658";

/** Taller than it is wide. Callers sizing by height multiply by this for width. */
export const MARK_ASPECT = 533 / 658;

/**
 * The shapes, uncoloured — the fill comes from whatever renders them, which on
 * the tile is `currentColor` and in the rasterised icons is a literal white.
 * The original's three near-whites (#FEFBF6, #FDFBFB, white) only ever differed
 * where a shadow fell across them, so they are one colour here.
 */
export const MARK_GEOMETRY = `
<path d="M163.763 344H163.785L187.785 636H166.535C154.395 636 144.155 626.96 142.65 614.914L108.848 344.5H50.836C43.2794 344.5 36.9022 338.879 35.9542 331.382L27.419 263.882C26.2862 254.922 33.2699 247 42.3009 247H156.785L163.763 344Z"/>
<path d="M375.318 344H375.298L350.785 636H372.035C384.175 636 394.415 626.96 395.92 614.914L429.722 344.5H487.734C495.291 344.5 501.668 338.879 502.616 331.382L511.151 263.882C512.284 254.922 505.3 247 496.269 247H381.785L375.318 344Z"/>
<path d="M213.785 246H323.785L306.785 635.5H230.285L213.785 246Z"/>
<circle cx="446.785" cy="70" r="22"/>
<ellipse cx="445.785" cy="36.5" rx="26" ry="25.5"/>
<ellipse cx="477.285" cy="59" rx="24.5" ry="25"/>
<path d="M135.696 121.285C82.4962 110.476 70.5295 148.14 71.1962 168.324L83.2986 233H251.299C250.965 219.322 248.496 190.041 241.696 178.832C234.896 167.623 210.196 149.475 198.696 141.802C227.196 88.7577 142.196 74.2454 135.696 121.285Z"/>
<path d="M70.7241 168.261C15.3036 165.802 19.3305 226.303 36.2606 232.919C36.7828 233.124 37.3414 233.187 37.9021 233.185L96.2986 233C121.222 187.851 89.4839 171.091 70.7241 168.261Z"/>
<path d="M339.696 82.2598C315.696 -13.239 178.196 53.2609 235.696 129.759L323.196 183.761L339.696 82.2598Z"/>
<path d="M76.2986 233C83.2986 212.667 105.796 178.162 140.196 203.762C144.863 189.929 162.396 166.462 195.196 183.262C191.196 153.762 231.196 97.2625 287.696 152.762C278.933 59.2868 434.186 52.0871 409.129 156.086C421.848 130.662 478.056 132.417 476.696 177.761C497.297 177.761 523.192 209.038 496.317 231.94C495.298 232.808 493.969 233.26 492.632 233.26L76.2986 233Z"/>
`.trim();

/**
 * The mark as a standalone document, for the two places that draw it through
 * `ImageResponse`.
 *
 * Satori will not read the shapes if they are handed to it as JSX — it lays out
 * boxes, and `<circle>` is not one. An `<img>` pointing at the whole thing is,
 * and resvg rasterises it afterwards with the geometry intact. Percent-encoded
 * rather than base64 so this stays the same code on either side of the render.
 */
export function markDataUri(fill = "#ffffff") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="${fill}">${MARK_GEOMETRY}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
