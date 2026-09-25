import { Link } from "@/components/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="m-0 font-display text-[30px] font-bold tracking-[-0.025em]">Nothing here</h1>
      <p className="m-0 text-sm text-ink-2">That page does not exist.</p>
      <Link href="/" className={buttonClass("primary", "sm")}>
        Go home
      </Link>
    </div>
  );
}
