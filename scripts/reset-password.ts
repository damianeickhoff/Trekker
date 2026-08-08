/**
 * Sets an account's password from the command line.
 *
 * This app sends no email and has no mail dependency, so there is no
 * out-of-band channel for a self-service "forgot password" — and security
 * questions would be strictly worse than nothing. For a self-hosted instance
 * the honest answer is that whoever runs the server can reset it, which is
 * this.
 *
 *   npx tsx scripts/reset-password.ts you@example.com
 *
 * The password is read from stdin, never from an argument: anything on the
 * command line lands in shell history and is visible to every other process on
 * the machine through `ps`.
 *
 * Bumps `tokenVersion`, so every session that was open on the old password
 * stops working — which is the whole point if the reason for the reset is that
 * somebody else had it.
 */
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import "dotenv/config";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npx tsx scripts/reset-password.ts <email>");
  process.exit(1);
}

/** Read one line without echoing it, so it is not left on screen. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: unknown };

    process.stdout.write(prompt);
    // readline echoes what it reads; muting its writer is the standard way to
    // stop a password appearing in the terminal and in any scrollback.
    stdout._writeToOutput = () => {};

    rl.question("", (answer) => {
      stdout._writeToOutput = undefined;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, plexManaged: true },
  });

  if (!user) {
    console.error(`No account with the address ${email}`);
    process.exit(1);
  }

  if (user.plexManaged) {
    console.error(
      `${email} is a managed Plex Home profile. It signs in through the main account, and a password here would do nothing.`,
    );
    process.exit(1);
  }

  const password = await askHidden(`New password for ${user.name} <${email}>: `);
  const again = await askHidden("Again: ");

  if (password !== again) {
    console.error("They do not match. Nothing was changed.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Too short — at least 8 characters. Nothing was changed.");
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      tokenVersion: { increment: 1 },
    },
  });

  console.log(`\nDone. ${email} can sign in with the new password.`);
  console.log("Every session that was already open has been signed out.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
