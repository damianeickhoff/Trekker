import type { ReactNode } from "react";

/*
 * A fold that stays mounted: the challenge strip, Also waiting on phones and
 * Settings' cards. Its one grid row goes from `0fr` to `1fr` over `--base`,
 * so what is under it slides rather than jumps, and its contents fade in a
 * beat behind the row (`fold-panel` in `globals.css`); closing fades them
 * over `--fast` as the row shuts. A closed panel is `visibility: hidden`
 * once it has shut, so nothing in it can be reached by Tab or a screen
 * reader, and it clips only while it moves, so a tile's shadow is not cut at
 * rest. With reduced motion it is a cut.
 *
 * `desk` stands it open from `lg` whatever `open` says: the fold is a phone's
 * affordance there (Settings, Also waiting). `still` draws the change without
 * a transition, for a state restored after paint rather than chosen.
 *
 * Space between a fold's head and its body goes inside the body (`className`),
 * never as a gap on the parent, or the gap would stand on under a shut fold.
 */
export function Unfold({
  open,
  desk = false,
  still = false,
  id,
  className = "",
  children,
}: {
  open: boolean;
  desk?: boolean;
  still?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      data-open={open ? "" : undefined}
      data-desk={desk ? "open" : undefined}
      data-still={still ? "" : undefined}
      className="fold-panel"
    >
      <div>
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
