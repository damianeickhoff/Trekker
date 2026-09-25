"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { readAllNews } from "@/lib/news-actions";
import { useBell } from "../bell/bell-provider";
import { buttonClass } from "../ui";

/** Marks every piece of news read, then draws the page again and asks the bell for its new count. */
export function MarkAllNews() {
  const router = useRouter();
  const { refresh } = useBell();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await readAllNews();
          refresh();
          router.refresh();
        })
      }
      className={buttonClass("ghost", "sm")}
    >
      Mark all read
    </button>
  );
}
