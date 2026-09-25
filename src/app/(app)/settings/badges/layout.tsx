import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

/**
 * The admin gate, in a layout rather than the page so it runs before any
 * loading boundary: Settings' own skeleton lives in the `(index)` group, and
 * this page's sits below here, so a refusal is decided before the first byte
 * and anyone but the admin gets a real 404, not a not-found page sent as 200.
 */
export default async function AdminOnly({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(user.id))) notFound();
  return children;
}
