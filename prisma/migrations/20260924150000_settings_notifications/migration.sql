-- Step 8's two notification switches, on the account. Friends and
-- recommendations default to on, because those pushes were already sent
-- before there was a switch; the monthly challenges push is new and starts
-- off. Additive: two columns with defaults, nothing rewritten.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "notifyFriends" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyChallenges" BOOLEAN NOT NULL DEFAULT false;
