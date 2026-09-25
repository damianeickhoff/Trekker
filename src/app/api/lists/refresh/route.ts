/**
 * The current app's daily cron address, kept so a Task Scheduler entry already
 * pointing at it goes on working after the switch. With no `job` parameter the
 * cron route runs the daily pass, which is where smart lists rebuild.
 */
export { GET, POST } from "../../cron/route";

export const dynamic = "force-dynamic";
