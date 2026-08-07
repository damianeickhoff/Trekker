import { Quote } from "lucide-react";
import { randomQuote } from "@/lib/quotes";

/**
 * Page footer. A rotating line beats a static attribution: it is the last thing
 * on the page, and it may as well be worth reading twice.
 */
export function QuoteFooter() {
  const quote = randomQuote();

  return (
    <footer className="mt-12 mb-2 flex flex-col items-center gap-1.5 text-center">
      <Quote size={14} className="text-ink-700" />
      <p className="max-w-md text-sm text-ink-400 italic">&ldquo;{quote.line}&rdquo;</p>
      <p className="text-[11px] tracking-wider text-ink-600 uppercase">{quote.source}</p>
    </footer>
  );
}
