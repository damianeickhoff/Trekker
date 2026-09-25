import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Every route reads cookies, so a Next prefetch is a real server render. With
 * the default on, each poster that scrolls into view would start one, and a
 * phone with six rails of them would spend its first seconds rendering pages
 * nobody asked for. Prefetch here is opt-in, one link at a time.
 */
export function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
