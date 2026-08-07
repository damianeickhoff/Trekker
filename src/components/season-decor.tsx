import type { Season } from "@/lib/seasons";

/**
 * The decorative layer behind the page, one arrangement per season.
 *
 * Two kinds of thing go in here. Ambience — starfield, fog, snow — is a tiled
 * or gradient background rather than a crowd of little elements: a hundred
 * snowflake divs would be a hundred things for the browser to lay out on every
 * scroll, whereas these are a handful of composited layers that cost nothing to
 * move. Motifs are drawn things in fixed places: a planet, a saucer, cobwebs, a
 * spider, bats.
 *
 * All the styling lives in `globals.css` under the `season-*` classes, so
 * tuning any of it never means touching this file.
 */
export function SeasonDecor({ season }: { season: Season | null }) {
  if (!season) return null;

  return (
    <div className="season-decor" aria-hidden>
      {season === "scifi" && <SciFi />}
      {season === "horror" && <Horror />}
      {season === "holiday" && <Holiday />}
    </div>
  );
}

function SciFi() {
  return (
    <>
      <div className="season-layer season-nebula" />
      <div className="season-layer season-stars-far" />
      <div className="season-layer season-stars" />
      <div className="season-layer season-grid" />

      <span className="season-motif season-shooting" />
      <span className="season-motif season-shooting season-shooting-late" />

      <span className="season-motif season-planet">
        <Planet />
      </span>

      <span className="season-motif season-ufo">
        <span className="season-ufo-bob">
          <Saucer />
        </span>
      </span>
    </>
  );
}

function Horror() {
  return (
    <>
      <div className="season-layer season-fog-high" />
      <div className="season-layer season-fog" />
      <div className="season-layer season-vignette" />

      <span className="season-motif season-web season-web-left">
        <Cobweb />
      </span>
      <span className="season-motif season-web season-web-right">
        <Cobweb />
      </span>

      <span className="season-motif season-spider">
        <Spider />
      </span>

      {["", "season-bat-high", "season-bat-low"].map((variant, i) => (
        <span key={i} className={`season-motif season-bat ${variant}`}>
          <span className="season-bat-flap">
            <Bat />
          </span>
        </span>
      ))}
    </>
  );
}

function Holiday() {
  return (
    <>
      <div className="season-layer season-glow" />
      <div className="season-layer season-snow-far" />
      <div className="season-layer season-snow" />
    </>
  );
}

/* -------------------------------------------------------------------------
 * The drawings. Each one is sized by its wrapper's width and inherits its
 * colour, so the CSS decides where it goes and how loud it is.
 * ---------------------------------------------------------------------- */

function Planet() {
  return (
    <svg viewBox="0 0 200 200" className="w-full" fill="none">
      <circle cx="100" cy="100" r="62" fill="currentColor" opacity="0.55" />
      <circle cx="78" cy="82" r="13" fill="#000" opacity="0.18" />
      <circle cx="118" cy="120" r="20" fill="#000" opacity="0.13" />
      <ellipse
        cx="100"
        cy="104"
        rx="94"
        ry="26"
        stroke="currentColor"
        strokeWidth="7"
        opacity="0.8"
        transform="rotate(-18 100 104)"
      />
    </svg>
  );
}

function Saucer() {
  return (
    <svg viewBox="0 0 120 70" className="w-full" fill="none">
      {/* Dome */}
      <path d="M38 34a22 22 0 0 1 44 0Z" fill="currentColor" opacity="0.5" />
      {/* Hull */}
      <ellipse cx="60" cy="36" rx="52" ry="12" fill="currentColor" opacity="0.85" />
      {/* Running lights */}
      <circle cx="30" cy="38" r="3.5" fill="#fff" opacity="0.9" />
      <circle cx="60" cy="40" r="3.5" fill="#fff" opacity="0.9" />
      <circle cx="90" cy="38" r="3.5" fill="#fff" opacity="0.9" />
      {/* Beam */}
      <path d="M46 44 L74 44 L88 70 L32 70 Z" fill="currentColor" opacity="0.14" />
    </svg>
  );
}

function Cobweb() {
  return (
    <svg viewBox="0 0 120 120" className="w-full" fill="none" stroke="currentColor" strokeWidth="1.6">
      {/* Radials out of the corner */}
      <path d="M0 0 L120 0M0 0 L104 46M0 0 L74 74M0 0 L46 104M0 0 L0 120" />
      {/* Threads strung between them */}
      <path d="M26 0 Q20 20 0 26" />
      <path d="M52 0 Q40 40 0 52" />
      <path d="M80 0 Q60 60 0 80" />
      <path d="M110 0 Q82 82 0 110" />
    </svg>
  );
}

function Spider() {
  return (
    <svg viewBox="0 0 40 200" className="w-full" fill="none">
      {/* The thread runs the whole height, so the body hangs off the top edge. */}
      <path d="M20 0 V150" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M14 158 Q4 152 2 166M14 164 Q3 166 4 178M26 158 Q36 152 38 166M26 164 Q37 166 36 178" />
      </g>
      <ellipse cx="20" cy="152" rx="6" ry="5" fill="currentColor" />
      <ellipse cx="20" cy="166" rx="9" ry="11" fill="currentColor" />
    </svg>
  );
}

function Bat() {
  return (
    <svg viewBox="0 0 120 50" className="w-full" fill="currentColor">
      <path d="M60 12c4 0 6 3 7 7 6-9 15-14 25-15-4 4-5 9-4 14 6-3 13-3 19 0-9 2-16 8-20 16-5-6-12-9-19-8-2 5-5 8-8 8s-6-3-8-8c-7-1-14 2-19 8-4-8-11-14-20-16 6-3 13-3 19 0 1-5 0-10-4-14 10 1 19 6 25 15 1-4 3-7 7-7Z" />
      <path d="M55 6l3 6h4l3-6-5 3-5-3Z" />
    </svg>
  );
}
