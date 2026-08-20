import "server-only";

import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";

/**
 * Anonymous ownership, so someone can delete their own generations without
 * signing in. The cookie holds a random id; only its hash is stored alongside
 * the Dit. Blob metadata is publicly readable, and the id is high-entropy, so
 * the hash gives away nothing even if a metadata object is fetched directly.
 */
const COOKIE = "dit_owner";
const A_YEAR = 60 * 60 * 24 * 365;

export function hashOwner(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

/** The visitor's owner hash, or null if they have never generated a Dit. */
export async function currentOwner(): Promise<string | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  return id ? hashOwner(id) : null;
}

/** Same, but mints and sets the cookie when absent. Route handlers only. */
export async function ensureOwner(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return hashOwner(existing);

  const id = randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: A_YEAR,
  });
  return hashOwner(id);
}
