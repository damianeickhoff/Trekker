import "server-only";
import { todayKey } from "./dates";
import { db } from "./db";
import { periodKey } from "./challenges/catalogue";
import { newsFor, newsPushes } from "./news";
import { airingLine, airingToday, challengesUpLines } from "./notifications";
import { sendToUser, type PushTopic } from "./push";

/**
 * The morning push: what is on today, and, for those who turned them on in
 * Settings › News, the last day's unread news about what they follow, in the
 * bell's own words: the big ones (`User.notifyNews`: renewals,
 * cancellations, endings, dates set or moved) and a followed person's new
 * work (`User.notifyNewsPeople`), one message each, once a day per person,
 * since the job marks each device told for the day.
 *
 * Nothing inside the app schedules it: a push at the refresh job's 04:00
 * would be a phone buzzing at four in the morning. Something outside calls
 * `/api/notifications/run` at a civil hour with the cron secret.
 *
 * Each person is marked as told for the day whatever the push services said,
 * so running the job twice sends nothing twice; a service that refused this
 * morning would refuse again in an hour, and a repeat is worse than none.
 *
 * On the first of the month it also says the new challenges are up, to those
 * who turned that on in Settings (`sendToUser` checks the switch).
 */
export async function runDailyPush(now = new Date()) {
  const today = todayKey(now);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Only people with a device not yet told today: a quiet instance costs this query.
  const due = await db.pushSubscription.findMany({
    where: { OR: [{ lastSent: null }, { lastSent: { not: today } }] },
    select: { userId: true },
    distinct: ["userId"],
  });

  const results: { userId: string; messages: number; sent: number; retired: number }[] = [];
  for (const { userId } of due) {
    const messages: { title: string; body: string; url: string; tag: string; topic?: PushTopic }[] = [];

    const airing = await airingToday(userId, today).catch(() => []);
    if (airing.length > 0) {
      messages.push({ title: "Airing today", body: airingLine(airing), url: "/calendar", tag: `airing-${today}` });
    }

    const prefs = await db.user.findUnique({
      where: { id: userId },
      select: { notifyNews: true, notifyNewsPeople: true, notifyChallenges: true },
    });
    if (prefs?.notifyNews || prefs?.notifyNewsPeople) {
      const news = (await newsFor(userId, { since }).catch(() => [])).filter((n) => !n.read);
      for (const push of newsPushes(news, { big: prefs.notifyNews, people: prefs.notifyNewsPeople }, today)) messages.push(push);
    }

    // Counted only for those who asked, so the result says what was meant to go.
    const firstOfMonth = now.getDate() === 1;
    const challenges = firstOfMonth && prefs?.notifyChallenges;
    if (challenges) {
      messages.push({ ...challengesUpLines(now), url: "/", tag: `challenges-${periodKey(now)}`, topic: "challenges" });
    }

    let sent = 0;
    let retired = 0;
    for (const { topic, ...message } of messages) {
      const r = await sendToUser(userId, message, topic);
      sent += r.sent;
      retired += r.retired;
    }
    await db.pushSubscription.updateMany({ where: { userId }, data: { lastSent: today } });
    results.push({ userId, messages: messages.length, sent, retired });
  }
  return { date: today, people: results.length, results };
}
