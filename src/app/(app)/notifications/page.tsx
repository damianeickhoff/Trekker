import type { Metadata } from "next";
import { Back } from "@/components/back-button";
import { NoteActions, NotificationsScreen } from "@/components/bell/notifications-screen";
import { PageBody } from "@/components/page";

export const metadata: Metadata = { title: "Notifications" };

/**
 * The bell on a phone, as a page; on a desktop the same list is a popover over
 * whatever is open. Nothing is read here on the server: the list is the bell's
 * own answer, which the chrome fetched after paint. Reached from the profile's
 * bell and from a push, so the way back goes through history.
 */
export default function NotificationsPage() {
  return (
    <PageBody className="gap-2! lg:max-w-[720px] lg:gap-4!">
      <header className="flex flex-col gap-2 lg:gap-4">
        <div className="flex h-[71px] items-center justify-between pt-[27px] lg:h-auto lg:pt-0">
          <Back href="/profile" name="Back" history />
          <span className="lg:hidden">
            <NoteActions />
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:tracking-[-0.025em]">
            Notifications
          </h1>
          <span className="hidden lg:inline-flex">
            <NoteActions />
          </span>
        </div>
      </header>
      <NotificationsScreen />
    </PageBody>
  );
}
