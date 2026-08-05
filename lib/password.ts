/**
 * Password hashing built on Web Crypto so it runs unchanged on Cloudflare
 * Workers (bcrypt/argon2 native bindings are not available there).
 *
 * Format: pbkdf2-sha256$<iterations>$<salt-b64>$<hash-b64>
 * The iteration count lives inside the record, so it can be raised later and
 * old hashes stay verifiable (see `needsRehash`).
 *
 * Note: PBKDF2 at this cost takes ~100-200ms of CPU. That exceeds the free
 * Workers plan's per-request CPU budget, so sign-in needs a paid plan (or a
 * lower ITERATIONS, at the cost of resistance to offline cracking).
 */

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * A syntactically valid record that no password matches. Verifying against it
 * when an account does not exist keeps the response time of "unknown email"
 * and "wrong password" indistinguishable.
 */
export const DUMMY_PASSWORD_HASH = `${ALGORITHM}$${ITERATIONS}$c2FsdHlkdW1teXBhZGRpbmc=$ZHVtbXloYXNodGhhdG5vcGFzc3dvcmR3aWxsZXZlcm1hdGNo`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // BufferSource typing: copy into a plain ArrayBuffer-backed view.
      salt: salt.slice(),
      iterations,
      hash: "SHA-256",
    },
    key,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

/** Compares two byte arrays without leaking where they first differ. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false;

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) {
    return false;
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return true;
  return Number.parseInt(parts[1], 10) < ITERATIONS;
}
