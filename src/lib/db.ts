import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

/**
 * The instance is cached across hot reloads so dev does not open a new database
 * connection per edit — but only while it is still an instance of the class we
 * just imported. Regenerating the client (after a migration adds a field) hands
 * us a brand new class, and the cached object is then built from the old
 * schema: it rejects every query mentioning the new columns until the whole
 * process restarts. Checking identity here makes a regenerate enough.
 */
export const db =
  globalForPrisma.prisma instanceof PrismaClient ? globalForPrisma.prisma : createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
