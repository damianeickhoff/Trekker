# syntax=docker/dockerfile:1

# Trekker, as an image.
#
# Three stages, for one reason: the things needed to *build* this — a C
# toolchain for better-sqlite3, the whole dev dependency tree, the source — are
# not needed to run it, and anything left in the final layer is something a
# deployment has to carry and an attacker gets to use. The runtime stage is the
# built server, its traced dependencies, and nothing else.
#
# Debian rather than Alpine on purpose. Both `better-sqlite3` and `sharp` ship
# prebuilt binaries for glibc and would otherwise be compiled from source on
# musl, which turns a two-minute build into a long one and needs the toolchain
# in the final image to stay reproducible.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app


# --- dependencies ------------------------------------------------------------
# Its own stage so it is cached on the lockfile alone: editing a component does
# not reinstall anything.
FROM base AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# `--ignore-scripts` above skips `postinstall`, which generates the Prisma
# client — it needs the schema, which is not copied yet, and would invalidate
# this layer on every schema edit if it were.
COPY prisma ./prisma
COPY prisma.config.ts ./

# `prisma.config.ts` resolves DATABASE_URL when it loads, so the CLI needs one
# even to generate a client. Nothing is read or written here — the real one is
# supplied at run time.
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate


# --- migration CLI -----------------------------------------------------------
# The Prisma CLI, on its own, for `migrate deploy` at startup.
#
# It needs a real dependency tree — copying `node_modules/prisma` alone leaves it
# unable to resolve its own imports — but it does not need the *app's* tree. So
# it gets its own install in its own prefix, which keeps a few tens of megabytes
# out of the runtime image instead of the whole production dependency set.
FROM base AS migrator
WORKDIR /opt/prisma
# ~257MB of the image, and most of it is Prisma Studio — React, a graph layout
# engine, a sync library — for a browser UI this container cannot open. They are
# regular dependencies of `prisma`, not optional ones, so `--omit=optional`
# does not shift them and neither does anything else short of pruning by hand.
# Left whole: a migration tool that half works is worth more than the megabytes.
RUN npm install --no-save --no-audit --no-fund prisma@7.9.1


# --- build -------------------------------------------------------------------
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

# Next reads this at build time for anything statically rendered. It is a build
# artefact only: the real database is mounted at run time, and nothing in this
# app is prerendered against it.
ENV DATABASE_URL="file:/tmp/build.db"
ENV NODE_ENV=production

RUN npm run build


# --- runtime -----------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Where the SQLite file lives. Mount a volume here or the database is lost with
# the container.
ENV DATABASE_URL="file:/data/trekker.db"

# `node` exists in the base image; running as it rather than as root means a
# compromise inside the app cannot write to the image itself.
RUN mkdir -p /data && chown -R node:node /data

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Migrations run at startup, so the schema and a working CLI have to be here.
# The CLI lives outside /app so its `node_modules` cannot shadow the traced ones
# the server itself resolves from.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker/prisma.config.ts ./prisma.config.ts
COPY --from=migrator --chown=node:node /opt/prisma/node_modules /opt/prisma/node_modules
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node
EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
