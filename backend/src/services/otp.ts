import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/** Wrong guesses allowed per emailed code before a new code must be requested. */
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Six digits from Node's CSPRNG (V6.5.3, V11.5.1). */
export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * A six-digit code has far less than 112 bits of entropy, so it is stored with
 * a salted, slow hash like a password, never in plain text (V6.5.2).
 */
export function hashOtp(otp: string) {
  return bcrypt.hash(otp, 10);
}

/** Constant-time check (V11.2.4). Codes stored before hashing was added never match. */
export async function verifyOtp(otp: string, storedHash: string | null | undefined) {
  if (!storedHash || !storedHash.startsWith("$2")) return false;
  return bcrypt.compare(otp, storedHash);
}

/** Constant-time comparison of two hex digests, e.g. hashed reset tokens (V11.2.4). */
export function sameDigest(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
