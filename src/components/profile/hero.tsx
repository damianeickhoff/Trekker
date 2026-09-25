import type { ReactNode } from "react";
import { HeroBone } from "../skeleton";
import { HeroArt } from "../title/hero";
import { UserAvatar } from "../user-avatar";
import { Count } from "../count";
import { DrawOnView } from "../draw";
import { FILL, fillTo } from "../motion";

/*
 * The profile's hero, dark in both themes: the chosen backdrop or the most
 * watched show's, blurred behind the scrim; a top row (the page title or the
 * way back, and its buttons); then the avatar, the name and the line, and
 * under them the level as a disc and a line. Text on it is white and its
 * buttons glass or white, whatever the theme. The scrim turns into the page
 * over its last `HERO_FADE`, and white type there would sit on paper in the
 * light theme, so the foot keeps a deeper padding than the mockup's.
 */

export type HeroLevel = {
  level: number;
  rank: string;
  toNextLevel: number;
  percent: number;
  maxed: boolean;
  /** The lifetime level, imported history and all, beside the one earned here. */
  lifetime?: number;
};

/** "Level 2 · Rookie · lifetime 29" and "210 XP to 3" over the amber bar. */
function LevelLine2({ level }: { level: HeroLevel }) {
  return (
    <span className="flex min-w-0 grow flex-col gap-1.5">
      <span className="flex justify-between gap-3 text-xs text-white/78">
        <span className="truncate">
          <strong className="text-white">Level {level.level}</strong> · {level.rank}
          {level.lifetime !== undefined && level.lifetime !== level.level ? ` · lifetime ${level.lifetime}` : ""}
        </span>
        {/* The XP figure counts up the first time it is seen, once per visit. */}
        <span className="shrink-0">
          {level.maxed ? (
            "Top level"
          ) : (
            <>
              <Count to={level.toNextLevel} once="xp" /> XP to {level.level + 1}
            </>
          )}
        </span>
      </span>
      <DrawOnView
        as="span"
        role="progressbar"
        aria-label={`Level ${level.level}, ${level.percent}% of the way to ${level.level + 1}`}
        aria-valuenow={level.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="block h-1.5 overflow-hidden rounded-full bg-[rgba(128,128,128,0.35)]"
      >
        <span className={`${FILL} draw-fill`} style={fillTo(level.percent)} />
      </DrawOnView>
    </span>
  );
}

export function ProfileHero({
  person,
  art,
  line,
  level,
  title,
  topLeft,
  phoneRight,
  deskTopRight,
  deskRight,
}: {
  person: { id: string; name: string; avatar: string | null };
  art: { path: string; kind: "backdrop" | "poster" } | null;
  line: string;
  level?: HeroLevel;
  /** "Profile" on your own; the name is then not the page's heading. */
  title?: string;
  /** In place of the title: the way back on somebody else's. */
  topLeft?: ReactNode;
  phoneRight?: ReactNode;
  /** Desktop's top row: Share and Edit profile. */
  deskTopRight?: ReactNode;
  /** Desktop, beside the name: Badges and Your year, or a friend's button. */
  deskRight?: ReactNode;
}) {
  const Name = title ? "span" : "h1";
  return (
    <div className="relative">
      <HeroArt path={art?.path ?? null} poster={art?.kind === "poster"} />
      <div className="relative text-white">
        <header className="flex h-[60px] items-center justify-between gap-2 px-5 pt-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {topLeft}
            {title && <h1 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.035em]">{title}</h1>}
          </div>
          {phoneRight && <div className="flex items-center gap-2 lg:hidden">{phoneRight}</div>}
          {deskTopRight && <div className="hidden items-center gap-2 lg:flex">{deskTopRight}</div>}
        </header>
        <div className="flex min-h-[214px] flex-col justify-end gap-3.5 px-5 pb-10 lg:min-h-[250px] lg:px-10 lg:pb-14">
          <div className="flex items-center gap-3.5 lg:gap-5">
            <span className="lg:hidden">
              <UserAvatar id={person.id} name={person.name} src={person.avatar} size={64} ring />
            </span>
            <span className="hidden lg:inline-flex">
              <UserAvatar id={person.id} name={person.name} src={person.avatar} size={88} ring />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <Name className="m-0 truncate font-display text-[28px] font-extrabold leading-[0.98] tracking-[-0.035em] lg:text-[40px]">
                {person.name}
              </Name>
              <span className="text-xs text-white/78 lg:text-sm">{line}</span>
            </span>
            {deskRight && (
              <>
                <span className="hidden grow lg:block" />
                <div className="hidden shrink-0 items-center gap-2 lg:flex">{deskRight}</div>
              </>
            )}
          </div>
          {level && (
            <div className="flex items-center gap-3.5 lg:max-w-[560px]">
              <span
                aria-hidden="true"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-display text-xl font-extrabold text-black"
              >
                {level.level}
              </span>
              <LevelLine2 level={level} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The hero's bones, box for box. */
export function ProfileHeroBones({ level = true }: { level?: boolean }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-night lg:bleed" />
      <div className="relative">
        <div className="flex h-[60px] items-center justify-between px-5 pt-4 lg:px-10">
          <HeroBone className="h-7 w-24 rounded-lg" />
          <HeroBone className="size-10 rounded-full lg:h-10 lg:w-56" />
        </div>
        <div className="flex min-h-[214px] flex-col justify-end gap-3.5 px-5 pb-10 lg:min-h-[250px] lg:px-10 lg:pb-14">
          <div className="flex items-center gap-3.5 lg:gap-5">
            <HeroBone className="size-16 rounded-full lg:size-[88px]" />
            <div className="flex flex-col gap-2">
              <HeroBone className="h-7 w-44 rounded-lg lg:h-10 lg:w-72" />
              <HeroBone className="h-3 w-56 rounded" />
            </div>
          </div>
          {level && (
            <div className="flex items-center gap-3.5 lg:max-w-[560px]">
              <HeroBone className="size-11 rounded-full" />
              <HeroBone className="h-1.5 grow rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
