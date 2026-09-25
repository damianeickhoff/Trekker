-- T1: background variants. Additive: two nullable columns on User, and null
-- means plain, which is what every account had before.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "background" TEXT;
ALTER TABLE "User" ADD COLUMN "backgroundHue" INTEGER;
