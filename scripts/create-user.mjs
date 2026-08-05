#!/usr/bin/env node
/**
 * Creates (or updates) a CMS user in D1.
 *
 * Usage:
 *   node scripts/create-user.mjs --email you@example.com [--name "Your Name"] [--role admin] [--remote]
 *
 * The password is read from stdin rather than argv, so it never lands in the
 * shell history or the process table.
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { webcrypto } from "node:crypto";

// Must stay in sync with lib/password.ts.
const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_BITS,
  );

  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  return `${ALGORITHM}$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

function parseArgs(argv) {
  const args = { role: "admin", remote: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--remote") args.remote = true;
    else if (arg === "--local") args.remote = false;
    else if (arg === "--email") args.email = argv[++i];
    else if (arg === "--name") args.name = argv[++i];
    else if (arg === "--role") args.role = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

/** Single-quoted SQL literal; the only user input reaching the statement. */
function sqlString(value) {
  if (value === undefined || value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

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

  const ask = async (prompt) => {
    // `rl.question` echoes; mute output between the prompt and the newline.
    const promise = rl.question(prompt);
    const originalWrite = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (text) => {
      if (text.includes(prompt)) originalWrite?.(prompt);
    };
    const answer = await promise;
    rl._writeToOutput = originalWrite;
    stdout.write("\n");
    return answer;
  };

  const password = await ask("Password: ");
  const confirm = await ask("Confirm password: ");
  rl.close();
  return { password, confirm };
}

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
