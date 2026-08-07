#!/bin/sh
set -e

# Bring the database up to the schema this image was built from, then hand over.
#
# `migrate deploy` only applies migrations that have not run; on an existing
# volume it is a no-op, and on an empty one it creates the database from
# nothing. Doing it here rather than in the build is the whole point — the
# database belongs to the deployment, not to the image.
echo "Applying database migrations…"
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy

exec "$@"
