import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import { regionForUser } from "@/lib/region";
import { certificationsFor, DEFAULT_FILTERS } from "@/lib/smart-filters";
import { SmartListEditor } from "@/components/smart-list-editor";
import { SetupNotice } from "@/components/ui";
import { tmdbConfigured } from "@/lib/tmdb";

export const metadata = { title: "New smart list — Trekker" };

export default async function NewSmartListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const region = await regionForUser(user.id);

  return (
    <div className="rise">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={15} />
        All lists
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">New smart list</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-400">
        A list that fills itself. Set the question and it keeps answering it — the preview updates
        as you go, and the saved list rebuilds itself once a day.
      </p>

      {tmdbConfigured() ? (
        <SmartListEditor
          initialName=""
          initialFilters={DEFAULT_FILTERS}
          providers={KNOWN_PROVIDERS}
          certifications={certificationsFor(region)}
          region={region}
        />
      ) : (
        <div className="mt-6">
          <SetupNotice />
        </div>
      )}
    </div>
  );
}
