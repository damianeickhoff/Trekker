import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SmartEditor } from "@/components/lists/smart-editor";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { regionFor } from "@/lib/providers";
import { seerrConnected } from "@/lib/request";
import { certificationsFor, DEFAULT_FILTERS } from "@/lib/smart-filters";

export const metadata: Metadata = { title: "New smart list" };

/** A new smart list. Made here, on the lists section, and nowhere else. */
export default async function NewSmartListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [me, seerr] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { region: true } }),
    seerrConnected(),
  ]);
  return (
    <SmartEditor
      listId={null}
      initialName=""
      initialFilters={DEFAULT_FILTERS}
      certifications={certificationsFor(regionFor(me?.region))}
      back="/lists"
      initialAutoRequest={false}
      seerrConnected={seerr}
    />
  );
}
