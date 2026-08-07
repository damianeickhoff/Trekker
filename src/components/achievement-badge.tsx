import {
  Award,
  Bookmark,
  Boxes,
  CalendarCheck,
  Camera,
  CheckCheck,
  Clapperboard,
  Film,
  Flame,
  Gauge,
  Ghost,
  Gift,
  Heart,
  History,
  Hourglass,
  Languages,
  Layers,
  Lock,
  MonitorPlay,
  Moon,
  PartyPopper,
  PenLine,
  Rocket,
  Ruler,
  Shapes,
  Sparkles,
  Star,
  Sun,
  Timer,
  Trophy,
  Tv,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Tier } from "@/lib/achievements";

/**
 * Icons are named in the catalogue as strings rather than imported there, so
 * the definitions stay a plain data file that a server module can read without
 * dragging React into it.
 */
const ICONS: Record<string, LucideIcon> = {
  award: Award,
  bookmark: Bookmark,
  boxes: Boxes,
  "calendar-check": CalendarCheck,
  camera: Camera,
  "check-check": CheckCheck,
  clapperboard: Clapperboard,
  film: Film,
  flame: Flame,
  gauge: Gauge,
  ghost: Ghost,
  gift: Gift,
  heart: Heart,
  history: History,
  hourglass: Hourglass,
  languages: Languages,
  layers: Layers,
  "monitor-play": MonitorPlay,
  moon: Moon,
  "party-popper": PartyPopper,
  "pen-line": PenLine,
  rocket: Rocket,
  ruler: Ruler,
  shapes: Shapes,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  timer: Timer,
  tv: Tv,
  users: Users,
};

const TIER_STYLE: Record<Tier, { face: string; ink: string; ring: string; label: string }> = {
  bronze: {
    face: "from-amber-700/40 to-amber-900/20 border-amber-600/40",
    ink: "text-amber-300 light:text-amber-700",
    ring: "text-amber-500",
    label: "Bronze",
  },
  silver: {
    face: "from-ink-600/50 to-ink-800/40 border-ink-600",
    ink: "text-ink-100",
    ring: "text-ink-300",
    label: "Silver",
  },
  gold: {
    face: "from-ember-500/40 to-ember-500/10 border-ember-500/50",
    ink: "text-ember-400",
    ring: "text-ember-400",
    label: "Gold",
  },
  legend: {
    face: "from-flare-500/45 to-ember-500/20 border-flare-500/60",
    ink: "text-flare-400",
    ring: "text-flare-400",
    label: "Legendary",
  },
};

export function tierLabel(tier: Tier) {
  return TIER_STYLE[tier].label;
}

/**
 * The badge itself: a medal face with the achievement's icon, ringed by how far
 * along you are. A locked badge keeps its shape but loses its colour, so a wall
 * of them still reads as a set to fill in rather than a wall of nothing.
 */
export function BadgeMedal({
  icon,
  tier,
  unlocked,
  percent,
  size = 56,
}: {
  icon: string;
  tier: Tier;
  unlocked: boolean;
  /** 0-100. Drawn as the ring around the medal. */
  percent?: number;
  size?: number;
}) {
  const Icon = ICONS[icon] ?? Trophy;
  const style = TIER_STYLE[tier];
  const stroke = 3;
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, percent ?? (unlocked ? 100 : 0)));

  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {/* The ring sits behind the face and only shows while there is ground
          left — a finished badge does not need a bar around it. */}
      {!unlocked && (
        <svg
          aria-hidden
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-ink-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(circumference * shown) / 100} ${circumference}`}
            className={`${style.ring} stroke-current transition-[stroke-dasharray]`}
          />
        </svg>
      )}

      <span
        style={{ width: size - 10, height: size - 10 }}
        className={`grid place-items-center rounded-full border bg-gradient-to-br ${
          unlocked
            ? `${style.face} ${style.ink}`
            : "border-ink-700 from-ink-800/60 to-ink-900/60 text-ink-600"
        }`}
      >
        {unlocked ? <Icon size={size * 0.4} strokeWidth={1.9} /> : <Lock size={size * 0.32} />}
      </span>
    </span>
  );
}

export function formatUnlocked(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
