import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import { watchRegion } from "@/lib/region";
import { certificationsFor, parseFilters } from "@/lib/smart-filters";
import { SmartListEditor } from "@/components/smart-list-editor";
import { requestCap } from "@/lib/auto-request-limits";
import { getSeerrConnection } from "@/lib/seerr";

export const metadata = { title: "Edit smart list — Trekker" };

type Params = { id: string };

/**
 * The same editor as `/watchlist/new`, opened onto an existing question.
 *
 * Read straight from the row rather than through `getList`: that one rebuilds a
 * stale list on the way past, and spending a fan of TMDB requests on an answer
 * the user is about to change is work for nothing.
 */
export default async function EditSmartListPage({ params }: { params: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const list = await db.mediaList.findFirst({
    where: { id, userId: user.id, kind: "smart" },
  });
  if (!list) notFound();

  const region = watchRegion();

  // Whether asking Overseerr for anything is even possible on this instance.
  const seerrConnected = Boolean(await getSeerrConnection());

  return (
    <div className="rise">
      <Link
        href={`/watchlist/list/${list.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={15} />
        Back to {list.name}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Edit smart list</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-400">
        Change the question and the preview follows. Saving rebuilds the list straight away.
      </p>

      <SmartListEditor
        listId={list.id}
        initialName={list.name}
        initialFilters={parseFilters(list.filters)}
        autoRequest={{
          enabled: list.autoRequest,
          scope: list.autoRequestScope === "all" ? "all" : "missing",
          cap: requestCap(list.autoRequestCap),
          lastRunAt: list.autoRequestedAt?.toISOString() ?? null,
          seerrConnected,
        }}
        providers={KNOWN_PROVIDERS}
        certifications={certificationsFor(region)}
        region={region}
      />
    </div>
  );
}
