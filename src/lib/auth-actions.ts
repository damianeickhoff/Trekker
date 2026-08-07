"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { createSession, destroySession, requireUser } from "./auth";

export type FormState = { error?: string };

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials
    .extend({ name: z.string().min(1, "Tell us your name").max(60) })
    .safeParse({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "That email is already registered" };

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
  });

  await createSession(user.id);
  redirect("/");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // An account created through Plex has no password of its own to check.
  if (user && !user.passwordHash) {
    return { error: "That account signs in with Plex — use the Plex button below" };
  }

  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash!))) {
    return { error: "Email or password is incorrect" };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function deleteAccount() {
  const user = await requireUser();
  await db.user.delete({ where: { id: user.id } });
  await destroySession();
  redirect("/register");
}
