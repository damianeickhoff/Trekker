import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryScreen } from "@/components/discover/listing";
import { CATEGORIES, isCategory, parsePage, parseType } from "@/lib/discover";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ type?: string | string[]; page?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  return { title: isCategory(category) ? CATEGORIES[category].title : "Discover" };
}

/** `/discover/in-cinemas?page=2`: one of Discover's rails in full, a TMDB page at a time. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const search = await searchParams;
  return <CategoryScreen slug={category} type={parseType(search.type)} page={parsePage(search.page)} />;
}
