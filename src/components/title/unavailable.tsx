import { Back } from "../back-button";

/**
 * TMDB has never answered for this title and cannot be reached now. Said as
 * that, not as a missing page: the title exists, this instance just cannot
 * describe it at the moment.
 */
export function TitleUnavailable() {
  return (
    <div className="flex flex-col gap-6 px-5 pt-4 lg:px-10 lg:pt-10">
      <div className="flex">
        <Back href="/" name="Back" history />
      </div>
      <div className="flex flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-ink-3 px-6 py-7 text-center">
        <p className="m-0 font-display text-lg font-bold">This title could not be loaded</p>
        <p className="m-0 max-w-[360px] text-[13px] leading-[1.45] text-ink-2">
          TMDB did not answer and nothing about it is stored here yet. Try again in a minute.
        </p>
      </div>
    </div>
  );
}
