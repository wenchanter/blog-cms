#!/usr/bin/env node
/**
 * Creates (or updates) a CMS user in D1.
 *
 * Usage:
 *   npm run user:create -- --email you@example.com [--name "Your Name"] [--role admin] [--remote]
 *
 * The password is read from stdin rather than argv, so it never lands in the
 * shell history or the process table.
 *
 * `hashPassword` is imported from the app rather than reimplemented here. This
 * file used to carry its own copy behind a "must stay in sync" comment, and it
 * duly fell out of sync: the app dropped to the 100,000-iteration ceiling that
 * Workers enforces while the script kept minting 210,000-iteration hashes that
 * production could never verify. One implementation removes that failure mode.
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { hashPassword } from "../lib/password";

type Args = {
  email?: string;
  name?: string;
  role: string;
  remote: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { role: "admin", remote: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--remote") args.remote = true;
    else if (arg === "--local") args.remote = false;
    else if (arg === "--email") args.email = argv[++i];
    else if (arg === "--name") args.name = argv[++i];
    else if (arg === "--role") args.role = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      // Almost always an unquoted multi-word --name, so say so rather than
      // leaving the reader to spot the missing quotes.
      if (!arg.startsWith("-")) {
        console.error(
          'Hint: quote values containing spaces, e.g. --name "Your Name"' +
            " (straight quotes, not “ ”).",
        );
      }
      process.exit(1);
    }
  }
  return args;
}

/** Single-quoted SQL literal; the only user input reaching the statement. */
function sqlString(value: string | undefined | null): string {
  if (value === undefined || value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Prompts on a TTY with the echo suppressed; falls back to reading a pipe. */
async function readSecrets() {
  if (!stdin.isTTY) {
    // Non-interactive: expect the password on stdin (piped or from a file).
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    const [password] = Buffer.concat(chunks).toString("utf8").split("\n");
    return { password, confirm: password };
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  // `_writeToOutput` is readline's internal echo hook — the only way to mute
  // typed characters. Not in the public typings, hence the narrow cast.
  const muted = rl as unknown as {
    _writeToOutput?: (text: string) => void;
  };

  const ask = async (prompt: string) => {
    // `rl.question` echoes; mute output between the prompt and the newline.
    const promise = rl.question(prompt);
    const originalWrite = muted._writeToOutput?.bind(rl);
    muted._writeToOutput = (text: string) => {
      if (text.includes(prompt)) originalWrite?.(prompt);
    };
    const answer = await promise;
    muted._writeToOutput = originalWrite;
    stdout.write("\n");
    return answer;
  };

  const password = await ask("Password: ");
  const confirm = await ask("Confirm password: ");
  rl.close();
  return { password, confirm };
}

/*
 * Everything runs inside `main` rather than at the top level: this package is
 * CommonJS, so tsx compiles a top-level `await` into a build error.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    console.error("Missing --email");
    process.exit(1);
  }
  if (!["admin", "author"].includes(args.role)) {
    console.error(`Invalid --role ${args.role} (expected "admin" or "author")`);
    process.exit(1);
  }

  const email = args.email.trim().toLowerCase();

  const { password, confirm } = await readSecrets();

  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const sql = `
INSERT INTO users (email, name, password_hash, role)
VALUES (${sqlString(email)}, ${sqlString(args.name)}, ${sqlString(passwordHash)}, ${sqlString(args.role)})
ON CONFLICT (email) DO UPDATE SET
  password_hash = excluded.password_hash,
  name = COALESCE(excluded.name, users.name),
  role = excluded.role,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
`.trim();

  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      args.remote ? "--remote" : "--local",
      "--command",
      sql,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) process.exit(result.status ?? 1);

  console.log(`\nUser ${email} (${args.role}) is ready.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
