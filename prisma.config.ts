import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // A fallback rather than `env()`, which throws when the variable is unset:
    // `prisma generate` runs on install and build and needs no database at all.
    url: process.env.DATABASE_URL ?? "file:./data/trekker.db",
  },
});
