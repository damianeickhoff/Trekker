# Running Trekker on Unraid

Everything here is Unraid-specific. The image itself is the ordinary one built
from the `Dockerfile` at the repo root; nothing in this directory changes it.

Two facts drive most of what follows:

- **The container runs as uid 1000**, not as Unraid's `nobody:users` (99:100).
  That is deliberate — every file the server writes to under `/app` (Next's
  cache included) is owned by 1000, so running as anything else breaks more than
  it fixes. The consequence is that the appdata directory has to be chowned.
- **Unraid pulls before it creates.** A template's `Repository` has to be
  something `docker pull` can resolve, which a locally built `trekker:latest`
  is not. Two ways round that, below.

---

## 1. Getting the image onto the box

### Option A — push to GHCR (recommended)

The template works as designed, and Unraid's own update check starts working:
it compares the local digest against the registry, so "update available" shows
up in the Docker tab like any other container.

On the machine with the source:

```bash
docker build -t ghcr.io/damianeickhoff/trekker:latest .
```

Then log in with a GitHub personal access token that has `write:packages`
(Settings → Developer settings → Tokens (classic)), and push:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u damianeickhoff --password-stdin && docker push ghcr.io/damianeickhoff/trekker:latest
```

The package is private on first push. Either make it public at
`https://github.com/users/damianeickhoff/packages/container/trekker/settings`,
or `docker login ghcr.io` on the Unraid box too (with a `read:packages` token —
Unraid persists `/root/.docker/config.json` to the flash drive, so the login
survives a reboot).

### Option B — build on Unraid

Also fine, with one caveat you were right to suspect: Unraid's root filesystem
is tmpfs and resets on reboot. But **Docker images are not stored there** — they
live in the Docker data root on the cache pool (`/mnt/user/system/docker/`), so
an image built on Unraid persists exactly like a pulled one.

What does *not* persist is the source checkout, so put it on a share, never in
`/root` or `/tmp`:

```bash
mkdir -p /mnt/user/appdata/trekker-src
```

Copy the working tree there (over SMB from Windows, or `rsync`), excluding
`node_modules`, `.next` and `dev.db` — the `.dockerignore` skips them anyway,
but they make the transfer far slower than it needs to be. Then:

```bash
cd /mnt/user/appdata/trekker-src && docker build -t trekker:latest .
```

Note that `git` is not part of a stock Unraid install; it comes from the
NerdTools plugin. Copying the tree avoids needing it, and has the side benefit
of including uncommitted work.

Because the template cannot pull `trekker:latest`, pick one:

- Set `Repository` in the template to `trekker:latest` and accept that Unraid
  logs a pull failure each time you hit Apply. Whether it then proceeds to
  create the container varies by Unraid version — if it does not, use the next
  option.
- Run a local registry (`registry:2` from Community Applications, port 5000),
  `docker tag trekker:latest localhost:5000/trekker:latest && docker push
  localhost:5000/trekker:latest`, and point `Repository` at
  `localhost:5000/trekker:latest`. Reliable, at the cost of one more container.

---

## 2. Prepare the data directory

**Do this before you start the container.** If `/data` is not writable the
entrypoint fails on its first action — creating the database — and the container
restart-loops with an `EACCES` in the log.

```bash
mkdir -p /mnt/user/appdata/trekker && chown -R 1000:1000 /mnt/user/appdata/trekker
```

A note on where this lives: the database is SQLite, and SQLite over Unraid's
`shfs` FUSE layer at `/mnt/user/...` has a long history of locking oddities with
other apps (Plex, the *arrs). Keeping the appdata share **cache-only, with no
mover pass**, is the standard mitigation and what this assumes. If you would
rather bypass FUSE entirely, point the host path at `/mnt/cache/appdata/trekker`
instead — same directory, direct path — but then it must never be moved to the
array.

---

## 3. Install the template

Copy `trekker.xml` to the flash drive:

```
/boot/config/plugins/dockerMan/templates-user/my-Trekker.xml
```

Then Docker → **Add Container** → Template → **Trekker** under user templates.

Fill in the two required values:

| Variable | How to generate |
| --- | --- |
| `AUTH_SECRET` | `openssl rand -base64 48` — signs session cookies; changing it later signs everyone out |
| `TMDB_API_KEY` | Free, from https://www.themoviedb.org/settings/api |

Everything else is optional and documented inline in the template. Hit Apply.

Check the log (Docker tab → Trekker → Logs). A healthy first start reads:

```
Applying database migrations…
...
26 migrations found in prisma/migrations
All migrations have been successfully applied.
▲ Next.js 16.3.0
✓ Ready
```

On every start after that, `migrate deploy` finds nothing to do and says so.

---

## 4. Reverse proxy

Point your proxy at `http://<unraid-ip>:3000`. Nothing in the app needs to know
its own public URL, so there is no base-URL setting to keep in sync.

Two things genuinely need HTTPS rather than merely benefiting from it:

- **Push notifications.** Service workers require a secure context, so push is
  unavailable over a bare LAN address no matter what the VAPID keys say.
- **The Plex webhook**, if Plex is running anywhere other than this box.

If you are on SWAG, the `authelia`/`authentik` snippets are unnecessary — the app
has its own accounts. Do make sure the proxy passes through the request body
without a small size cap: Trakt and Plex imports POST a zip.

---

## 5. Daily jobs (optional)

`trekker-daily.sh` calls the two endpoints that have no in-app scheduler. Install
the **User Scripts** plugin from Community Applications, add a script, paste the
file in, set `CRON_SECRET` at the top to match the container's, and give it a
custom schedule of `0 17 * * *`.

Skipping this costs you: push notifications never fire, and smart lists rebuild
lazily on first view (correct, just slow that once).

---

## 6. Backups

The entire application state is one file: `/mnt/user/appdata/trekker/trekker.db`.
Community Applications' **Appdata Backup** plugin will handle it, and because it
stops the container first, the copy is consistent. If you back it up some other
way, stop the container first or you risk copying a database mid-write.
