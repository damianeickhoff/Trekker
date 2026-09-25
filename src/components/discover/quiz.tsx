import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/title";
import { vibeArtwork } from "@/lib/what-to-watch";
import {
  AUDIENCES,
  KINDS,
  QUESTION_ORDER,
  RESULTS_PATH,
  answered,
  answerHref,
  answersLine,
  backHref,
  readAnswers,
  timeQuestionFor,
  timesFor,
  toQuery,
  type Answers,
  type Audience,
  type KindId,
  type QuestionId,
} from "@/lib/what-to-watch-quiz";
import { MobileTop } from "../page";
import { Bone } from "../skeleton";
import { IconLink } from "../ui";
import { QuizSlide, QuizStep } from "./quiz-step";

/*
 * What to watch: four questions, one page each, the answers in the address.
 * The page is a server component; only the chosen tile is client state.
 */

const HEADINGS: Record<QuestionId, { title: (a: Audience | null, k: KindId | null) => string; sub: (k: KindId | null) => string }> = {
  who: {
    title: () => "Who are you watching with tonight?",
    sub: () => "Pick one. Nothing is saved; this is just for tonight.",
  },
  kind: {
    title: () => "A film, or a show?",
    sub: () => "Pick one. The next question is about the mood.",
  },
  vibe: {
    title: (a) => a!.vibeQuestion,
    sub: () => "Pick one. The next question is about how long you have tonight.",
  },
  time: {
    title: (_, k) => timeQuestionFor(k!),
    sub: (k) =>
      k === "tv" ? "Episodes, not evenings: a series is as long as you let it be." : "Pick one, and Trekker picks the rest.",
  },
};

export async function QuizScreen({ search }: { search: Record<string, string | string[] | undefined> }) {
  await requireUser();
  const read = readAnswers(search);
  const given = answered(read);
  if (read.next === null) redirect(`${RESULTS_PATH}?${toQuery(given)}`);

  const question = read.next;
  const step = QUESTION_ORDER.indexOf(question) + 1;
  const was = typeof search.was === "string" ? search.was : undefined;
  const heading = HEADINGS[question];
  const close = <IconLink href="/discover" icon="x" label="Close and go back to Discover" />;

  return (
    <>
      <MobileTop title="What to watch" right={close} />
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[18px] px-5 pt-2 lg:gap-7 lg:px-10 lg:pt-10">
        <div className="hidden items-center justify-between lg:flex">
          <h1 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em]">What to watch</h1>
          {close}
        </div>
        <QuizProgress step={step} line={answersLine(read)} />
        {/* The question and its answers slide in from the side travelled towards (`QuizSlide`). */}
        <QuizSlide>
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <h2 className="m-0 font-display text-[30px] font-extrabold leading-[0.98] tracking-[-0.035em] text-balance lg:text-[44px]">
            {heading.title(read.audience, read.kind?.value ?? null)}
          </h2>
          <p className="m-0 text-[13px] text-ink-2 lg:text-sm">{heading.sub(read.kind?.value ?? null)}</p>
        </div>
        {question === "vibe" ? (
          <Suspense fallback={<VibeBones count={read.audience!.vibes.length} />}>
            <VibeStep audience={read.audience!} kind={read.kind!.value} given={given} was={was} />
          </Suspense>
        ) : (
          <PlainStep question={question} given={given} kind={read.kind?.value ?? null} was={was} />
        )}
        </QuizSlide>
      </div>
    </>
  );
}

/** "Question 3 of 4", the answers so far in amber, and four bars filling as they are answered. */
export function QuizProgress({ step, line }: { step: number; line: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono-label">Question {step} of 4</span>
        {line && <span className="mono-label truncate text-[10px] text-accent-text!">{line}</span>}
      </div>
      <div
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={step - 1}
        className="flex gap-1.5"
      >
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-sm ${n <= step ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </div>
    </div>
  );
}

function PlainStep({
  question,
  given,
  kind,
  was,
}: {
  question: Exclude<QuestionId, "vibe">;
  given: Partial<Answers>;
  kind: KindId | null;
  was?: string;
}) {
  const choices = question === "who" ? AUDIENCES : question === "kind" ? KINDS : timesFor(kind!);
  return (
    <QuizStep
      layout={question === "who" ? "grid" : "row"}
      initial={was}
      back={backHref(given, question)}
      backLabel={question === "who" ? "Discover" : "Back"}
      options={choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint, href: answerHref(given, question, c.value) }))}
    />
  );
}

/** The moods, each over artwork the cache holds for the answer that leaves the length open; the placeholder where it holds none. */
async function VibeStep({ audience, kind, given, was }: { audience: Audience; kind: KindId; given: Partial<Answers>; was?: string }) {
  const art = await vibeArtwork(audience, kind);
  return (
    <QuizStep
      layout="art"
      initial={was}
      back={backHref(given, "vibe")}
      backLabel="Back"
      options={audience.vibes.map((v) => ({
        value: v.value,
        label: v.label,
        hint: v.hint,
        poster: art[v.value] ?? null,
        href: answerHref(given, "vibe", v.value),
      }))}
    />
  );
}

export function VibeBones({ count }: { count: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        {Array.from({ length: count }, (_, i) => (
          <Bone key={i} className="h-[120px] rounded-[14px] lg:h-[140px]" />
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <Bone className="h-4 w-14 rounded" />
        <Bone className="h-11 w-24 rounded-full" />
      </div>
    </>
  );
}
