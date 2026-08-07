import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { register } from "@/lib/auth-actions";
import { getAuthSlides } from "@/lib/catalogue";

export const metadata = { title: "Create a profile — Trekker" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  const slides = await getAuthSlides();
  return <AuthForm mode="register" action={register} slides={slides} />;
}
