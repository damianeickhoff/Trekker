import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SmartEditor } from "@/components/lists/smart-editor";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { smartListForEdit } from "@/lib/lists";
import { regionFor } from "@/lib/providers";
import { seerrConnected } from "@/lib/request";
import { certificationsFor, parseFilters } from "@/lib/smart-filters";

export const metadata: Metadata = { title: "Edit smart list" };

/** A smart list's question, to change. Saving sends it back to be rebuilt. */
export default async function EditSmartListPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const [list, me, seerr] = await Promise.all([
    smartListForEdit(user.id, id),
    db.user.findUnique({ where: { id: user.id }, select: { region: true } }),
    seerrConnected(),
  ]);
  if (!list) notFound();
  return (
    <SmartEditor
      listId={list.id}
      initialName={list.name}
      initialFilters={parseFilters(list.filters)}
      certifications={certificationsFor(regionFor(me?.region))}
      back={`/lists/${list.id}`}
      initialAutoRequest={list.autoRequest}
      seerrConnected={seerr}
    />
  );
}
