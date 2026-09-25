import { BackgroundSync } from "@/components/background-sync";
import { BadgeToast } from "@/components/bell/badge-toast";
import { BellProvider } from "@/components/bell/bell-provider";
import { CacheRefresher } from "@/components/cache-refresher";
import { ScreensaverIdle } from "@/components/screensaver-idle";
import { Sidebar } from "@/components/sidebar";
import { TabBar } from "@/components/tab-bar";
import { WarmHome } from "@/components/warm-home";

/**
 * The signed-in chrome. Synchronous on purpose: the proxy has already checked
 * the session, and nothing here needs data, so the chrome and each route's
 * skeleton go out in the first bytes. The bell, the level line and the unlock
 * toast fetch their own answer in the browser once the page has painted, and
 * the screensaver's idle watcher reads its minutes from that same answer.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <BellProvider>
      <div className="lg:flex">
        <Sidebar />
        {/*
          The column is capped and centred in what the sidebar leaves on
          desktop (`--column-w` in `globals.css`); on a wide screen it is as
          wide as the window less `--content-edge` either side, and still
          centred, so the gap after the sidebar matches the gap at the right.
          Heroes and bands reach back out to the edges with `bleed`, and the
          clip trims whatever a scrollbar makes them overrun. `clip` rather than `hidden`, so the
          column does not become a scroller and nothing sticky inside it stops
          sticking.
        */}
        <main className="min-w-0 grow pb-(--tab-bar-clearance) lg:overflow-x-clip lg:pb-10">
          <div className="lg:mx-auto lg:max-w-(--column-w)">
            {children}
          </div>
        </main>
        <TabBar />
        <WarmHome />
        <CacheRefresher />
        <BadgeToast />
        <ScreensaverIdle />
        <BackgroundSync />
      </div>
    </BellProvider>
  );
}
