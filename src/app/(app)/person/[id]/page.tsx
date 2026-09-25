import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonPage } from "@/components/person-page";
import { loadPerson, parsePersonFilter } from "@/lib/person";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const person = await loadPerson(Number(id));
  return { title: person?.name ?? "Person" };
}

/** `/person/17419`: TMDB's person id. `?show=seen`, `unseen` or `services` filters the work. */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Promise<{ show?: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { show } = await searchParams;
  const filter = parsePersonFilter(show);
  return <PersonPage id={Number(id)} filter={filter} />;
}
