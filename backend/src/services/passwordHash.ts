import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export type PasswordHashScheme = "bcrypt" | "bcrypt_sha256";

function prehash(password: string): string {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

/** Hash the complete password before bcrypt so its 72-byte input limit cannot truncate it. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(prehash(password), 12);
}

/** Support existing direct-bcrypt hashes; callers may upgrade successful legacy logins. */
export async function verifyPassword(
  password: string,
  passwordHash: string,
  scheme: PasswordHashScheme = "bcrypt",
): Promise<boolean> {
  return bcrypt.compare(scheme === "bcrypt_sha256" ? prehash(password) : password, passwordHash);
}