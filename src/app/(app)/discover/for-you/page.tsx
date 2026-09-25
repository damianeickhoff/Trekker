import type { Metadata } from "next";
import { ForYouScreen } from "@/components/discover/listing";
import { parsePage, parseType } from "@/lib/discover";

export const metadata: Metadata = { title: "Things you may like" };

type Props = { searchParams: Promise<{ type?: string | string[]; page?: string | string[] }> };

/** `/discover/for-you?type=tv&page=2`: the recommendations row in full, narrowable to films or shows. */
export default async function ForYouPage({ searchParams }: Props) {
  const search = await searchParams;
  return <ForYouScreen type={parseType(search.type)} page={parsePage(search.page)} />;
}
