// Password hashing with PBKDF2 from the built-in Web Crypto API.
//
// Why not Better Auth's default (scrypt)? On the Cloudflare Workers free plan a request
// may use only ~10 ms of CPU time, and scrypt needs far more. PBKDF2 runs natively in
// the Workers runtime; 100,000 rounds (the most Workers allows) takes about 7 ms.
//
// A stored hash looks like:  pbkdf2-sha256$100000$<salt>$<hash>   (salt and hash in base64)
// The round count is saved inside each hash, so it can be raised later (e.g. on the paid
// plan) without breaking passwords that were saved with the old count.
//
// This file has no imports, so the seed script can use it too.

const ROUNDS = 100_000;
const PREFIX = "pbkdf2-sha256";

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ROUNDS);
  return [PREFIX, ROUNDS, toBase64(salt), toBase64(hash)].join("$");
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [prefix, rounds, salt, expected] = hash.split("$");
  if (prefix !== PREFIX || !rounds || !salt || !expected) return false;
  const actual = await derive(password, fromBase64(salt), Number(rounds));
  return sameBytes(actual, fromBase64(expected));
}

/** Compares every byte even after a mismatch, so the time taken doesn't reveal how much matched. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
