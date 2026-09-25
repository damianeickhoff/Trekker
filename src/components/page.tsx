import type { ReactNode } from "react";
import { Link } from "./link";
import { Bone } from "./skeleton";
import { AvatarMenu } from "./avatar-menu";
import { BellLink } from "./bell/bell";
import { IconLink, PageTitle, Wordmark } from "./ui";

/**
 * The right end of every tab page's phone row: the bell, then the avatar,
 * each a 40px box on one centre line with the search button before them.
 * The bell opens `/notifications`, as the profile hero's does, and carries
 * the unread dot.
 */
export function PhoneAccount({ onHero = false }: { onHero?: boolean }) {
  return (
    <>
      <BellLink kind={onHero ? "glass" : "ghost"} />
      <AvatarMenu variant="phone" />
    </>
  );
}

/**
 * Phones: the page's own top row. Tab pages carry search, the bell and the
 * avatar top-right; `right` replaces them where a page needs its own
 * controls, ending with `PhoneAccount` on a tab page. The wordmark is 28px,
 * a fifth over the 24px it was, its mark still at cap height in the 60px row.
 */
export function MobileTop({
  title,
  right,
  onHero = false,
}: {
  title: "wordmark" | string;
  right?: ReactNode;
  /** Sitting on a hero, which is dark in both themes: white type, glass buttons. */
  onHero?: boolean;
}) {
  return (
    <header
      className={`relative z-(--z-top-row) flex h-[60px] shrink-0 items-center justify-between px-5 pt-4 lg:hidden ${onHero ? "text-white" : ""}`}
    >
      {title === "wordmark" ? (
        <Link href="/" aria-label="Trekker home">
          <Wordmark size={28} />
        </Link>
      ) : (
        <h1 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.035em]">{title}</h1>
      )}
      <div className="flex items-center gap-2">
        {right ?? (
          <>
            <IconLink href="/search" icon="search" label="Search" kind={onHero ? "glass" : "ghost"} />
            <PhoneAccount onHero={onHero} />
          </>
        )}
      </div>
    </header>
  );
}

/** Desktop: the title row at the top of the content column. */
export function DesktopHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hidden items-center gap-4 lg:flex">
      <PageTitle>{title}</PageTitle>
      {children}
    </div>
  );
}

/**
 * A page below a tab with no hero of its own (Still to watch, Cast, More like
 * this, Comments): the way back alone on the top row (`Back`: a round button
 * on phones, a text link naming the destination on desktop), then the title
 * and a quiet line under it. On phones the top row stands where `MobileTop`
 * would, 60px with the same 16px of air.
 */
export function BackHeader({ back, title, meta }: { back: ReactNode; title: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 lg:gap-4">
      <div className="flex h-[60px] items-center pt-4 lg:h-auto lg:pt-0">{back}</div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:tracking-[-0.025em]">
          {title}
        </h1>
        {meta}
      </div>
    </header>
  );
}

/** `BackHeader`'s skeleton, box for box. */
export function BackHeaderBones() {
  return (
    <div className="flex flex-col gap-2 lg:gap-4">
      <div className="flex h-[60px] items-center pt-4 lg:h-auto lg:pt-0">
        <Bone className="size-10 rounded-full lg:hidden" />
        <Bone className="hidden h-4 w-20 rounded lg:block" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Bone className="h-[27px] w-48 rounded-md lg:h-[31px] lg:w-56" />
        <Bone className="h-3 w-40 rounded" />
      </div>
    </div>
  );
}

/** The content column's padding, matched to the mockups at both sizes. */
export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-6 px-5 pt-2.5 lg:gap-7 lg:px-10 lg:pt-7 ${className}`}>{children}</div>
  );
}
