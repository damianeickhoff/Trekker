import Image from "next/image";
import { Icon } from "./icon";

/*
 * A person on this instance: their picture, or their initials on a colour of
 * their own, chosen from their id so it never changes. The amber ring is the
 * signed-in person's own avatar in the chrome; other people's go without.
 */

const TINTS = ["#1F6B78", "#D62A7A", "#3D5A45", "#2A3340", "#C9661B", "#4C7FA8", "#2A6EA6", "#B3121A", "#5A6270", "#D9491F"];

function tintOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserAvatar({
  id,
  name,
  src,
  size = 44,
  ring = false,
  className = "",
}: {
  id: string;
  name: string;
  src: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const shape = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
    ring ? "shadow-[0_0_0_2px_var(--accent)]" : ""
  } ${className}`;
  if (src) {
    return (
      <span className={shape} style={{ width: size, height: size }}>
        <Image unoptimized src={src} alt="" width={size} height={size} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${shape} font-display font-bold text-white`}
      style={{ width: size, height: size, background: tintOf(id), fontSize: Math.round(size * 0.36) }}
    >
      {name ? initials(name) : <Icon name="user" size={Math.round(size * 0.5)} />}
    </span>
  );
}
