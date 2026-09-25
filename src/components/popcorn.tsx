import { BUCKET_NAMES } from "@/lib/popcorn";

/*
 * The popcorn bucket, one drawing per level of the scale, on the icon grid:
 * 24 units, round joins, drawn in `currentColor` so it takes the ink of
 * whatever it sits on. Golden is the one exception, filled amber with black
 * lines in both themes, because the top of the scale should look like a prize.
 */

const BODY = "M5.5 8.5h13l-1.4 12.5H6.9z";
const STRIPES = "M9.3 8.5l.7 12.5M14.7 8.5l-.7 12.5";
const RIM = "M4.5 6.5h15v2h-15z";

function Kernels({ at, fill = "currentColor", stroke }: { at: [number, number, number][]; fill?: string; stroke?: string }) {
  return (
    <g fill={fill} stroke={stroke ?? "none"} strokeWidth={stroke ? 1 : undefined}>
      {at.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

function Empty() {
  return (
    <>
      <path d={BODY} />
      <path d={STRIPES} />
      <path d={RIM} />
    </>
  );
}

export function Bucket({ level, size = 24, className = "" }: { level: number; size?: number; className?: string }) {
  let inner: React.ReactNode;
  if (level <= 1) {
    // Knocked over, its last kernels on the floor.
    inner = (
      <>
        <g transform="rotate(-68 9 17)">
          <Empty />
        </g>
        <Kernels at={[[16, 20.5, 1.7], [19.5, 18.5, 1.7], [20.5, 22, 1.4]]} />
      </>
    );
  } else if (level === 2) {
    inner = <Empty />;
  } else if (level === 3) {
    inner = (
      <>
        <Empty />
        <Kernels at={[[9.5, 12.5, 1.8], [14.5, 12.5, 1.8], [12, 15.5, 1.8]]} />
      </>
    );
  } else if (level === 4) {
    inner = (
      <>
        <Empty />
        <Kernels at={[[8, 5, 2.1], [12, 3.6, 2.2], [16, 5, 2.1]]} />
      </>
    );
  } else {
    inner = (
      <>
        <g fill="#F2B233" stroke="#000" strokeWidth={1.2}>
          <path d={BODY} />
          <path d={RIM} />
        </g>
        <path d={STRIPES} stroke="rgba(0,0,0,0.35)" />
        <Kernels
          fill="#FFF1C2"
          stroke="#000"
          at={[[7, 5.2, 2.2], [10.5, 2.8, 2.3], [14.2, 2.4, 2.3], [17.5, 4.8, 2.2], [12.3, 5.6, 2]]}
        />
      </>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {inner}
    </svg>
  );
}

/** A rating shown, not asked: one bucket and its name. */
export function PopcornShown({ level, size = 22, className = "" }: { level: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Bucket level={level} size={size} />
      <span className="text-xs font-semibold">{BUCKET_NAMES[level - 1]}</span>
    </span>
  );
}
