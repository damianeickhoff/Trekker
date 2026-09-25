import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { bellTag } from "@/lib/notifications";
import { sendToUser } from "@/lib/push";
import { scheduleAvailability } from "@/lib/refresh";
import { handleSeerrWebhook } from "@/lib/seerr-webhook";

/**
 * Overseerr's webhook: see `lib/seerr-webhook.ts`. After answering, the one
 * title's availability is checked the way the daily pass checks it (so an
 * arrival gets its Play on Plex), and whoever should hear about an arrival is
 * pushed and has their bell expired.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const answer = await handleSeerrWebhook(request);
  const { title, notify } = answer;
  if (title) {
    for (const userId of notify ?? []) {
      try {
        revalidateTag(bellTag(userId), { expire: 0 });
      } catch {
        // Nothing cached for them yet.
      }
    }
    after(async () => {
      await scheduleAvailability({ mediaType: title.mediaType, tmdbId: title.tmdbId, title: title.title }).catch((error) =>
        console.error("availability after an Overseerr webhook failed", error),
      );
      const name = title.title || "Something you asked for";
      for (const userId of notify ?? []) {
        await sendToUser(userId, {
          title: `${name} is on Plex`,
          body: "Ready to watch",
          url: `/title/${title.mediaType}/${title.tmdbId}`,
          tag: `arrived:${title.mediaType}-${title.tmdbId}`,
        }).catch(() => undefined);
      }
    });
  }
  return NextResponse.json(answer.body, { status: answer.status });
}
