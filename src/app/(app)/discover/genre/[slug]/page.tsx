import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenreScreen } from "@/components/discover/listing";
import { parsePage, parseType } from "@/lib/discover";
import { findGenre } from "@/lib/genres";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string | string[]; page?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: findGenre(slug)?.label ?? "Discover" };
}

/** `/discover/genre/horror?type=movie&page=2`: a genre, narrowable to films or shows. */
export default async function GenrePage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!findGenre(slug)) notFound();
  const search = await searchParams;
  return <GenreScreen slug={slug} type={parseType(search.type)} page={parsePage(search.page)} />;
}
