/**
 * The Prisma config the container uses, in place of the one at the repo root.
 *
 * Two differences, both because a container is not a workstation:
 *
 *  - No `dotenv`. Environment comes from Docker, and the package is not in the
 *    runtime image — importing it there is both pointless and fatal.
 *  - No imports at all, in fact. This file is loaded by a CLI that lives outside
 *    the app directory, so anything it tried to import would be resolved against
 *    an app tree that deliberately has no `node_modules` of its own.
 *
 * Keep the schema and migration paths in step with `prisma.config.ts` at the
 * root; they are the same project, read by the same CLI.
 */
export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
