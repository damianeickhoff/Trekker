import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { login } from "@/lib/auth-actions";
import { getAuthSlides } from "@/lib/catalogue";

export const metadata = { title: "Sign in — Trekker" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");

  const [slides, { error }] = await Promise.all([getAuthSlides(), searchParams]);

  // The Plex round trip reports failures by bouncing back here with a message.
  return <AuthForm mode="login" action={login} slides={slides} notice={error?.slice(0, 200)} />;
}
