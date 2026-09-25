-- Marks accounts whose stored level state has been brought into line with a
-- full evaluation at server start (`repairLevels` in `lib/achievements`). Added
-- null, so every existing account is evaluated once on the next start, under
-- the rule that whatever the imported history alone meets is carried.
ALTER TABLE "User" ADD COLUMN "levelRepairedAt" DATETIME;
