/**
 * The fields of `User` that are allowed to leave in an export.
 *
 * Enumerated, never a spread, and kept in its own module so a test can assert
 * it rather than trusting a reviewer to notice. The same row holds
 * `passwordHash`, `plexAuthToken`, `plexToken`, `seerrApiKey` and
 * `traktClientId`; a `select: *` would put every one of them in a file the
 * user is likely to email to themselves, drop in cloud storage, or attach to a
 * bug report.
 *
 * `avatarData` is left out for a duller reason — raw bytes that would bloat
 * the file for something already served at `/api/avatar/[id]`.
 *
 * Adding a field here is a decision about what is safe to hand out. See
 * `tests/export-fields.test.ts`, which fails if anything that looks like a
 * credential appears in this list.
 */
export const EXPORTABLE_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  accent: true,
  theme: true,
  themeResolved: true,
  providers: true,
  coverBackdrop: true,
  coverTitle: true,
  plexUsername: true,
  traktUsername: true,
  challengesCollapsed: true,
  xpPanelCollapsed: true,
  screensaverIdle: true,
  screensaverSource: true,
  screensaverPlace: true,
} as const;
