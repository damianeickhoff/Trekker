# syntax=docker/dockerfile:1

# Trekker, as an image.
#
# Three stages, for one reason: the things needed to *build* this — a C
# toolchain for better-sqlite3, the whole dev dependency tree, the source — are
# not needed to run it, and anything left in the final layer is something a
# deployment has to carry and an attacker gets to use. The runtime stage is the
# built server, its traced dependencies, and nothing else.
#
# Alpine, for the size: the Debian base was 247MB of the image against Alpine's
# ~60MB, for a runtime that needs a Node binary and libc and nothing else.
# `sharp` ships a musl build and `better-sqlite3` compiles against musl in the
# deps stage, so the toolchain stays out of the final layer either way.

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app


# --- dependencies ------------------------------------------------------------
# Its own stage so it is cached on the lockfile alone: editing a component does
# not reinstall anything.
FROM base AS deps

# better-sqlite3 has no musl prebuild, so it is compiled here — in a stage that
# is thrown away, which is the whole reason for splitting them.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# `--ignore-scripts` above is aimed at Prisma's `postinstall` (see below), but it
# is not selective — it also skips better-sqlite3's own install script, which is
# the thing that compiles the native binding. Without this rebuild the package
# arrives as JavaScript with no addon behind it: the image builds, the server
# starts, and every query then fails with "Could not locate the bindings file".
# This is the step the toolchain above exists for.
RUN npm rebuild better-sqlite3

# `--ignore-scripts` also skips `postinstall`, which generates the Prisma
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
RUN npm install --no-save --no-audit --no-fund prisma@7.9.1

# Most of what that pulls in is Prisma Studio: a browser UI a container has no
# way to serve. Its bundle is 29MB, the esbuild metafiles beside it another 5MB,
# and the React/graph-layout/sync packages it draws on ~65MB more.
#
# Those go; the packages holding them do not. The CLI resolves
# `@prisma/studio-core/data/bff` and `@prisma/dev/internal/state` on its way to
# `migrate deploy`, and removing either stops it dead — which is not a guess:
# both were tried, and both broke the container on the first run.
#
# ~100MB in total, and the CLI is still ~155MB of this image for a tool that
# runs once at startup. Moving it out entirely means a second image and a
# compose dependency; see the note in docker-compose.yml.
RUN rm -rf       node_modules/@prisma/studio-core/dist/ui       node_modules/@prisma/studio-core/dist/metafile-cjs.json       node_modules/@prisma/studio-core/dist/metafile-esm.json       node_modules/@electric-sql       node_modules/elkjs       node_modules/react-dom


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

# sharp ships prebuilt libvips for every platform it supports, and Next traces
# all of them in. This image is musl on x64, so the glibc build and the
# WebAssembly fallback are 27MB of binaries that can never be loaded.
RUN rm -rf       ./node_modules/@img/sharp-libvips-linux-x64       ./node_modules/@img/sharp-linux-x64       ./node_modules/@img/sharp-wasm32

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

# `wget` is busybox's, already in the base image — no curl to install for this.
#
# The start period covers the migrations, which run before the server binds and
# take a few seconds on a first, empty volume; without the grace the container
# would be declared unhealthy for doing exactly what it is supposed to on its
# first start. Restarting on failure is deliberately left to the orchestrator —
# Docker marks a container unhealthy but will not act on it, and on Unraid the
# Docker tab surfaces that state directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
