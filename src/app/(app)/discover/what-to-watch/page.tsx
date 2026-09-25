import type { Metadata } from "next";
import { QuizScreen } from "@/components/discover/quiz";

export const metadata: Metadata = { title: "What to watch" };

/**
 * `/discover/what-to-watch?who=solo&kind=tv`: the first question not yet
 * answered. Every answer is in the address, so the browser's back button
 * walks back through the questions and a half-finished run is a link.
 */
export default async function WhatToWatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <QuizScreen search={await searchParams} />;
}
