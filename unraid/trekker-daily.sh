#!/bin/bash
#
# Trekker's two daily jobs, for the Unraid User Scripts plugin.
#
# There is no scheduler inside the app, so something outside has to call these
# once a day:
#
#   /api/notifications/run   the "what is on tonight" push, one per user per day
#   /api/lists/refresh       rebuilds smart lists that have aged out
#
# Neither is load-bearing. Push simply does not fire without the first; smart
# lists rebuild themselves on first view without the second, they are just slow
# that once. So a failure here is a degraded day, not an outage.
#
# Install: User Scripts -> Add New Script -> name it "trekker-daily", paste this
# in, set the schedule to Custom with `0 17 * * *` (5pm — early enough that
# "tonight" is still ahead of you, late enough that today's TMDB data is in).
#
# Set CRON_SECRET below to the same value as the container's CRON_SECRET.

CRON_SECRET="paste-the-same-value-as-the-container-here"

# The container's port on the Unraid host. Localhost on purpose: this bypasses
# the reverse proxy, so the jobs keep running if TLS or DNS is having a day.
TREKKER="http://localhost:3000"

if [ "$CRON_SECRET" = "paste-the-same-value-as-the-container-here" ]; then
  echo "CRON_SECRET is not set in this script. Nothing to do."
  exit 1
fi

run() {
  local name="$1"
  local path="$2"

  # --max-time so a wedged request cannot leave the script running all day.
  local body
  body=$(curl -sS --max-time 300 -w '\n%{http_code}' \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$TREKKER$path" 2>&1)

  local code="${body##*$'\n'}"
  local payload="${body%$'\n'*}"

  if [ "$code" = "200" ]; then
    echo "$name: ok — $payload"
  else
    # 503 means the feature is switched off (no push keys, no TMDB key), which
    # is a fine state to be in and worth distinguishing from a real failure.
    echo "$name: HTTP $code — $payload"
  fi
}

echo "=== Trekker daily jobs, $(date) ==="
run "notifications" "/api/notifications/run"
run "smart lists"   "/api/lists/refresh"
echo "=== done ==="
