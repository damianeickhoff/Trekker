import { authSecretProblem } from "./secrets";

/**
 * Refuses to start a production server without a usable AUTH_SECRET, so a
 * misconfigured deployment fails on boot rather than on somebody's first
 * sign-in. Development has its own throwaway fallback in `secrets`.
 */
export function assertBootConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const problem = authSecretProblem();
  if (!problem) return;

  console.error(
    `${problem}. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
  );
  process.exit(1);
}
