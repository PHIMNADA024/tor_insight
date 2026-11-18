import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { CodeChallengeMethod } from "google-auth-library";
import { OAuthLoginCode, OAuthState } from "../models/oauth.js";
import { User } from "../models/user.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { isRecord } from "../middleware/validation.js";
import { signAccessToken } from "../services/token.js";
import {
  GoogleAuthError,
  createGoogleClient,
  findOrCreateGoogleUser,
  getGoogleConfig,
  verifyGoogleIdToken,
  type GoogleAuthErrorCode,
} from "../services/googleAuth.js";

/**
 * Sign in with Google (OpenID Connect, authorization code flow).
 *
 * 1. GET  /google           sends the browser to Google with state, nonce and a PKCE challenge
 * 2. GET  /google/callback  Google sends the browser back with a code; we check the state,
 *                           swap the code for an ID token and verify it
 * 3. POST /google/exchange  the frontend swaps a one-time login code for our access token
 */
const router = Router();

const STATE_COOKIE = "tor_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 60 * 1000;
const RANDOM_VALUE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

function randomValue() {
  return crypto.randomBytes(32).toString("base64url");
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function frontendUrl() {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",")[0].trim();
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // still sent when Google redirects the browser back to us
    path: "/api/auth/google",
  };
}

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function sameString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Results go in the URL fragment, which the browser never sends to any server. */
function redirectToFrontend(res: Response, result: { code: string } | { error: GoogleAuthErrorCode }) {
  const fragment = "code" in result ? `code=${result.code}` : `error=${result.error}`;
  return res.redirect(303, `${frontendUrl()}/auth/google#${fragment}`);
}

router.get("/google", authLimiter, async (_req, res) => {
  const config = getGoogleConfig();
  if (!config) {
    return redirectToFrontend(res, { error: "not_configured" });
  }

  try {
    const client = createGoogleClient(config);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomValue();
    const nonce = randomValue();

    await OAuthState.create({
      stateHash: hash(state),
      codeVerifier,
      nonce,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    const url = client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: "select_account",
    });

    res.cookie(STATE_COOKIE, state, { ...cookieOptions(), maxAge: STATE_TTL_MS });
    return res.redirect(303, url);
  } catch (error) {
    console.error(error);
    return redirectToFrontend(res, { error: "server_error" });
  }
});

router.get("/google/callback", authLimiter, async (req, res) => {
  const cookieState = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, cookieOptions());

  try {
    const config = getGoogleConfig();
    if (!config) throw new GoogleAuthError("not_configured");

    const { code, state, error } = req.query;
    if (typeof state !== "string" || !RANDOM_VALUE.test(state)) {
      throw new GoogleAuthError("invalid_request");
    }

    // Each state works once, even if the checks below fail.
    const pending = await OAuthState.findOneAndDelete({
      stateHash: hash(state),
      expiresAt: { $gt: new Date() },
    });

    // The state must be the one we gave this browser: stops login CSRF, where an
    // attacker makes the victim's browser finish the attacker's Google login.
    if (!pending || !cookieState || !sameString(cookieState, state)) {
      throw new GoogleAuthError("invalid_request");
    }
    if (typeof error === "string") throw new GoogleAuthError("cancelled");
    if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
      throw new GoogleAuthError("invalid_request");
    }

    const client = createGoogleClient(config);
    let idToken: string | null | undefined;
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: pending.codeVerifier });
      idToken = tokens.id_token;
    } catch {
      throw new GoogleAuthError("invalid_request");
    }
    if (!idToken) throw new GoogleAuthError("invalid_token");

    const identity = await verifyGoogleIdToken(client, idToken, config.clientId, pending.nonce);
    const user = await findOrCreateGoogleUser(identity);

    const loginCode = randomValue();
    await OAuthLoginCode.create({
      codeHash: hash(loginCode),
      userId: user._id,
      expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
    });
    return redirectToFrontend(res, { code: loginCode });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return redirectToFrontend(res, { error: error.code });
    }
    console.error(error);
    return redirectToFrontend(res, { error: "server_error" });
  }
});

router.post("/google/exchange", authLimiter, async (req, res) => {
  try {
    if (!isRecord(req.body) || Object.keys(req.body).some((field) => field !== "code")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const { code } = req.body;
    if (typeof code !== "string" || !RANDOM_VALUE.test(code)) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // Deleting while reading makes the code single-use, even with parallel requests.
    const login = await OAuthLoginCode.findOneAndDelete({
      codeHash: hash(code),
      expiresAt: { $gt: new Date() },
    });
    if (!login) {
      return res.status(401).json({ message: "Login code is invalid or expired" });
    }

    const user = await User.findById(login.userId);
    if (!user) {
      return res.status(401).json({ message: "Login code is invalid or expired" });
    }
    if (user.status === "disabled") {
      return res.status(403).json({ message: "This account has been disabled" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signAccessToken({ id: user._id.toString(), role: user.role });
    return res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Login failed" });
  }
});

export default router;
