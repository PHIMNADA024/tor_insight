import crypto from "node:crypto";
import { dictionary } from "@zxcvbn-ts/language-common";

// The package's common-password corpus is popularity-ranked and has over 49k entries.
// Checking its first 10k exceeds V6.2.4's top-3k minimum.
const COMMON_PASSWORDS = new Set(
  dictionary["passwords-common"]
    .filter((value) => [...value].length >= 8)
    .slice(0, 10_000)
    .map((value) => value.toLowerCase()),
);

export type PasswordPolicyFailure = "too_short" | "too_long" | "common" | "compromised" | "unavailable";
export type PasswordPolicyResult = { ok: true } | { ok: false; reason: PasswordPolicyFailure };

export function checkPasswordLength(password: unknown): PasswordPolicyFailure | undefined {
  if (typeof password !== "string" || [...password].length < 8) return "too_short";
  if ([...password].length > 128) return "too_long";
  return undefined;
}

/** Use HIBP's range API so the password itself is never sent to the service. */
export async function isPasswordCompromised(password: string): Promise<boolean> {
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: {
      "Add-Padding": "true",
      "User-Agent": "TOR-Insight-Password-Policy",
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`HIBP range request failed with status ${response.status}`);

  const ranges = await response.text();
  return ranges.split(/\r?\n/).some((line) => {
    const [candidate, count] = line.trim().split(":");
    return candidate?.toUpperCase() === suffix && Number(count) > 0;
  });
}

export async function validateNewPassword(password: unknown): Promise<PasswordPolicyResult> {
  const lengthFailure = checkPasswordLength(password);
  if (lengthFailure) return { ok: false, reason: lengthFailure };

  const candidate = password as string;
  if (COMMON_PASSWORDS.has(candidate.toLowerCase())) return { ok: false, reason: "common" };

  try {
    if (await isPasswordCompromised(candidate)) return { ok: false, reason: "compromised" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

export function passwordPolicyMessage(reason: PasswordPolicyFailure): string {
  const messages: Record<PasswordPolicyFailure, string> = {
    too_short: "Password must be at least 8 characters",
    too_long: "Password must be no more than 128 characters",
    common: "Choose a less common password",
    compromised: "This password has appeared in a data breach. Choose a different password.",
    unavailable: "Password security checks are temporarily unavailable. Please try again later.",
  };
  return messages[reason];
}