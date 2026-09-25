import { channelLabel, subjectKey, type Channel, type Chip, type Subject } from "@/lib/news-page";
import { Link } from "../link";
import { PRESS } from "../motion";
import { Poster } from "../poster";
import { PersonPhoto } from "../title/people";

/*
 * Your channels (Round 10): a round button per followed person, show or saved
 * film with news in the last thirty days, the poster cropped to a face or the
 * headshot. Unread news rings it in amber with a count, since unread is
 * state; the chosen one keeps the ring. A tap filters the page to that
 * subject (`?subject=tv:123`), with the chip still applying; tapping the
 * chosen one again lets go. The address is replaced, as the chips' is.
 */

export function channelHref(chip: Chip, subject: Subject | null) {
  const params = new URLSearchParams({ tab: chip });
  if (subject) params.set("subject", subjectKey(subject));
  return `/news?${params}`;
}

function RoundButton({ channel, chip, chosen }: { channel: Channel; chip: Chip; chosen: boolean }) {
  const lit = chosen || channel.unread > 0;
  const label = channelLabel(channel);
  return (
    <Link
      href={channelHref(chip, chosen ? null : channel.subject)}
      replace
      scroll={false}
      aria-current={chosen ? "true" : undefined}
      aria-label={`${channel.name}${channel.unread ? `, ${channel.unread} unread` : ""}${chosen ? ", showing only this" : ""}`}
      className={`${PRESS} flex w-16 shrink-0 flex-col items-center gap-1.5`}
    >
      <span
        className={`relative inline-flex size-16 rounded-full border-2 p-[3px] transition-colors duration-(--fast) ease-out ${lit ? "border-accent" : "border-line"}`}
      >
        <span className="block size-full overflow-hidden rounded-full bg-surface-2">
          {channel.subject.kind === "person" ? (
            <PersonPhoto id={channel.subject.id} name={channel.name} path={channel.image} sizes="54px" text="text-[19px]" className="size-full object-[center_20%]" />
          ) : (
            <Poster path={channel.image} alt="" title={null} width={54} height={81} sizes="54px" className="size-full object-[center_18%]" />
          )}
        </span>
        {channel.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-[5px] font-mono text-[11px] font-semibold text-black">
            {channel.unread}
          </span>
        )}
      </span>
      <span className={`max-w-16 truncate text-[11px] font-semibold ${lit ? "text-ink" : "text-ink-3"}`}>{label}</span>
    </Link>
  );
}

/**
 * The round buttons, as a centred, wrapping row in the desktop column's card
 * (`wrap`) or a swipe row on a phone.
 */
export function ChannelButtons({ channels, chip, chosen, wrap = false }: { channels: Channel[]; chip: Chip; chosen: Subject | null; wrap?: boolean }) {
  const key = chosen ? subjectKey(chosen) : null;
  return (
    <nav
      aria-label="Your channels"
      className={
        wrap
          ? "flex flex-wrap justify-center gap-2.5 pb-0.5 pt-2"
          : "no-scrollbar -mx-5 flex snap-x snap-proximity scroll-px-5 gap-3 overflow-x-auto px-5 py-1 *:snap-start"
      }
    >
      {channels.map((c) => (
        <RoundButton key={subjectKey(c.subject)} channel={c} chip={chip} chosen={key === subjectKey(c.subject)} />
      ))}
    </nav>
  );
}
