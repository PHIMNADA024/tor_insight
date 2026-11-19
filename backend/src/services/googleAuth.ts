import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/user.js";

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Reason codes the frontend can show. They never contain user data. */
export type GoogleAuthErrorCode =
  | "not_configured"
  | "cancelled"
  | "invalid_request"
  | "invalid_token"
  | "email_not_verified"
  | "account_disabled"
  | "account_conflict"
  | "server_error";

export class GoogleAuthError extends Error {
  constructor(readonly code: GoogleAuthErrorCode) {
    super(`Google sign-in failed: ${code}`);
  }
}

/** Google sign-in is off unless all three values are set. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function createGoogleClient(config: GoogleConfig) {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
}

export type GoogleIdentity = { googleId: string; email: string; name: string };

function sameString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Checks Google's ID token before we trust anything in it.
 * verifyIdToken checks the signature against Google's keys, the expiry and
 * that the token was issued for our client ID. We also check the issuer, that
 * the nonce matches this login attempt (so an old token can't be replayed) and
 * that Google has verified the email address.
 */
export async function verifyGoogleIdToken(
  client: OAuth2Client,
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<GoogleIdentity> {
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthError("invalid_token");
  }

  if (!payload || !GOOGLE_ISSUERS.includes(payload.iss) || payload.aud !== clientId) {
    throw new GoogleAuthError("invalid_token");
  }
  if (typeof payload.nonce !== "string" || !sameString(payload.nonce, expectedNonce)) {
    throw new GoogleAuthError("invalid_token");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) {
    throw new GoogleAuthError("invalid_token");
  }
  if (typeof payload.email !== "string" || payload.email.length > 254) {
    throw new GoogleAuthError("invalid_token");
  }
  if (payload.email_verified !== true) {
    throw new GoogleAuthError("email_not_verified");
  }

  const email = payload.email.toLowerCase().trim();
  const name = (typeof payload.name === "string" ? payload.name.trim() : "").slice(0, 100) || email.split("@")[0];
  return { googleId: payload.sub, email, name };
}

/**
 * Finds the TOR Insight account for a verified Google identity, linking or
 * creating it when needed. Accounts are matched on Google's stable user ID
 * (sub) first, never on the email alone once linked.
 */
export async function findOrCreateGoogleUser(identity: GoogleIdentity, retry = true) {
  const linked = await User.findOne({ googleId: identity.googleId });
  if (linked) {
    if (linked.status === "disabled") throw new GoogleAuthError("account_disabled");
    return linked;
  }

  const existing = await User.findOne({ email: identity.email }).select("+passwordHash");
  if (existing) {
    if (existing.status === "disabled") throw new GoogleAuthError("account_disabled");
    // Already linked to a different Google account: don't silently switch.
    if (existing.googleId) throw new GoogleAuthError("account_conflict");

    existing.googleId = identity.googleId;
    if (!existing.isEmailVerified) {
      // Someone registered this email but never proved they own it. Google has
      // now proved the real owner, so drop the unverified password: otherwise
      // whoever set it could still log in to the owner's account.
      existing.set("passwordHash", undefined);
      existing.set("emailVerificationToken", undefined);
      existing.set("emailVerificationExpires", undefined);
      existing.passwordChangedAt = new Date();
      existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
      existing.isEmailVerified = true;
    }
    await existing.save();
    return existing;
  }

  try {
    return await User.create({
      name: identity.name,
      email: identity.email,
      googleId: identity.googleId,
      role: "end_user",
      status: "active",
      isEmailVerified: true,
    });
  } catch (error) {
    // Two sign-ins for the same new user at once: the other one created it.
    if (retry && (error as { code?: number }).code === 11000) {
      return findOrCreateGoogleUser(identity, false);
    }
    throw error;
  }
}
