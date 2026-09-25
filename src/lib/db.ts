import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/trekker.db";
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

/**
 * One client per process. The identity check matters in development: after a
 * `prisma generate` the cached instance belongs to the old class and rejects
 * any query naming a new column, so it is replaced rather than reused.
 */
export const db =
  globalForPrisma.prisma instanceof PrismaClient ? globalForPrisma.prisma : createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
