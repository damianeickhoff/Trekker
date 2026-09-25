import type { Person } from "@/lib/friends";
import { avatarStack } from "@/lib/friends-watched";
import { UserAvatar } from "../user-avatar";

/*
 * The friends who have seen an episode, on its row in a season's list: up to
 * three faces overlapping, then "+2". It is one picture with one name for a
 * screen reader ("Watched by Jason and Soraya"), and it never grows past four
 * short items, so on a phone it takes a fixed sliver from the episode's name,
 * which truncates, rather than pushing the date or the tick along.
 */

export function AvatarStack({ people, size = 18 }: { people: Person[]; size?: number }) {
  if (people.length === 0) return null;
  const { shown, more, label } = avatarStack(people);
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0 items-center">
      {shown.map((p, i) => (
        // A ring of the page's colour cuts each face out of the one it overlaps.
        <UserAvatar
          key={p.id}
          id={p.id}
          name={p.name}
          src={p.avatar}
          size={size}
          className={`ring-2 ring-bg ${i > 0 ? "-ml-1.5" : ""}`}
        />
      ))}
      {more > 0 && <span className="ml-1 font-mono text-[10px] font-semibold text-ink-3">+{more}</span>}
    </span>
  );
}
