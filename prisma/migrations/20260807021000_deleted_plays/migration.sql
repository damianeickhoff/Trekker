-- Gravestones for sourced plays the user has deleted on purpose.
--
-- Without these, deleting a play imported from Plex removed the very row whose
-- `sourceRef` told the sync it had already seen that history entry — so the
-- next sync, ten minutes later, imported it straight back. `recordPlay` now
-- checks here before creating anything that carries a ref.
CREATE TABLE "DeletedPlay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletedPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeletedPlay_userId_source_sourceRef_key" ON "DeletedPlay"("userId", "source", "sourceRef");
