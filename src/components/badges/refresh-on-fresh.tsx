"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useBell } from "../bell/bell-provider";

/**
 * The board has just written a badge the level card above it did not know
 * about yet: read the page once more so the card and its count agree, and
 * tell the bell, so the toast announces it now rather than in a minute. The
 * second render finds nothing new, so this runs once.
 */
export function RefreshOnFresh() {
  const router = useRouter();
  const { refresh } = useBell();
  useEffect(() => {
    router.refresh();
    refresh();
  }, [router, refresh]);
  return null;
}
