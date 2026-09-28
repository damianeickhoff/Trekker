import { Back } from "../back-button";
import { EmptyState } from "../empty-state";

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
      <EmptyState icon="film" title="This title could not be loaded">
        TMDB did not answer and nothing about it is stored here yet. Try again in a minute.
      </EmptyState>
    </div>
  );
}
