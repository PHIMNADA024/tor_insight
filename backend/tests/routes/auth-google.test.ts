import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { OAuth2Client } from "google-auth-library";
import { generate } from "otplib";
import { OAuthLoginCode, OAuthState } from "../../src/models/oauth.js";
import { User } from "../../src/models/user.js";
import authRoutes from "../../src/routes/auth.js";
import googleAuthRoutes from "../../src/routes/auth-google.js";
import userRoutes from "../../src/routes/user.js";
import { encryptMfaSecret } from "../../src/services/mfa.js";
import { signAccessToken, verifyAccessToken, verifyMfaSetupToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

jest.mock("../../src/middleware/rateLimit.js", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { authLimiter: passThrough, otpLimiter: passThrough };
});

jest.mock("../../src/services/email.js", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

// The real policy also asks Have I Been Pwned over the network.
jest.mock("../../src/services/passwordPolicy.js", () => ({
  checkPasswordLength: (password: unknown) =>
    typeof password !== "string" || [...password].length < 8
      ? "too_short"
      : [...password].length > 128 ? "too_long" : undefined,
  passwordPolicyMessage: (reason: string) => reason,
  validateNewPassword: jest.fn(async () => ({ ok: true })),
}));

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/users", userRoutes);

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const REDIRECT_URI = "http://localhost:4000/api/auth/google/callback";
const FRONTEND = "http://localhost:3000";

type Payload = Record<string, unknown>;

function googlePayload(nonce: string, overrides: Payload = {}): Payload {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-user-123",
    email: "somchai@gmail.com",
    email_verified: true,
    name: "Somchai Google",
    nonce,
    ...overrides,
  };
}

let getTokenSpy: jest.SpiedFunction<typeof OAuth2Client.prototype.getToken>;
let verifyIdTokenSpy: jest.SpiedFunction<typeof OAuth2Client.prototype.verifyIdToken>;

/** Makes Google's token endpoint and ID token check return this payload. */
function googleReturns(payload: Payload | ((nonce: string) => Payload)) {
  getTokenSpy.mockResolvedValue({ tokens: { id_token: "signed.id.token" }, res: null } as never);
  verifyIdTokenSpy.mockImplementation((async () => ({
    getPayload: () => (typeof payload === "function" ? payload(lastNonce) : payload),
  })) as never);
}

let lastNonce = "";

/** Step 1: start the login and read what we sent to Google. */
async function startLogin() {
  const res = await request(app).get("/api/auth/google");
  expect(res.status).toBe(303);
  const url = new URL(res.headers.location);
  const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("tor_oauth_state="));
  const state = url.searchParams.get("state")!;
  lastNonce = url.searchParams.get("nonce")!;
  return { res, url, cookie: cookie!, state, nonce: lastNonce };
}

/** Step 2: Google sends the browser back. */
function callback(query: Record<string, string>, cookieState?: string) {
  const req = request(app).get("/api/auth/google/callback").query(query);
  return cookieState === undefined ? req : req.set("Cookie", `tor_oauth_state=${cookieState}`);
}

function fragmentOf(location: string) {
  const url = new URL(location);
  expect(`${url.origin}${url.pathname}`).toBe(`${FRONTEND}/auth/google`);
  return new URLSearchParams(url.hash.slice(1));
}

function exchange(code: string | null) {
  return request(app).post("/api/auth/google/exchange").send({ code });
}

/** Runs steps 1 and 2 and returns what the frontend receives. */
async function completeLogin() {
  const { state } = await startLogin();
  const res = await callback({ code: "google-auth-code", state }, state);
  expect(res.status).toBe(303);
  return fragmentOf(res.headers.location);
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), OAuthState.init(), OAuthLoginCode.init()]);
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = REDIRECT_URI;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  getTokenSpy = jest.spyOn(OAuth2Client.prototype, "getToken");
  verifyIdTokenSpy = jest.spyOn(OAuth2Client.prototype, "verifyIdToken");
  googleReturns((nonce) => googlePayload(nonce));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/auth/google", () => {
  it("is turned off until the Google client is configured", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;

    const res = await request(app).get("/api/auth/google");

    expect(res.status).toBe(303);
    expect(fragmentOf(res.headers.location).get("error")).toBe("not_configured");
    expect(await OAuthState.countDocuments()).toBe(0);
  });

  it("sends the browser to Google with state, nonce and a S256 PKCE challenge", async () => {
    const { url } = await startLogin();

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("puts the state in an HttpOnly, SameSite=Lax cookie and stores only its hash", async () => {
    const { cookie, state } = await startLogin();

    expect(cookie).toContain(`tor_oauth_state=${state}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);

    const stored = await OAuthState.findOne().lean();
    expect(stored!.stateHash).toBe(crypto.createHash("sha256").update(state).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(state);
  });

  it("uses a new state and nonce for every login", async () => {
    const first = await startLogin();
    const second = await startLogin();

    expect(second.state).not.toBe(first.state);
    expect(second.nonce).not.toBe(first.nonce);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("creates a verified end_user account without a password for a new Google user", async () => {
    const fragment = await completeLogin();

    expect(fragment.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const user = await User.findOne({ email: "somchai@gmail.com" }).select("+passwordHash").lean();
    expect(user).toMatchObject({
      name: "Somchai Google",
      googleId: "google-user-123",
      role: "end_user",
      status: "active",
      isEmailVerified: true,
    });
    expect(user!.passwordHash).toBeUndefined();
  });

  it("sends the PKCE verifier that matches the challenge when swapping the code", async () => {
    const { url, state } = await startLogin();
    await callback({ code: "google-auth-code", state }, state);

    const { code, codeVerifier } = getTokenSpy.mock.calls[0][0] as { code: string; codeVerifier: string };
    expect(code).toBe("google-auth-code");
    expect(crypto.createHash("sha256").update(codeVerifier).digest("base64url")).toBe(
      url.searchParams.get("code_challenge"),
    );
  });

  it("checks the ID token against our client ID", async () => {
    await completeLogin();

    expect(verifyIdTokenSpy).toHaveBeenCalledWith({ idToken: "signed.id.token", audience: CLIENT_ID });
  });

  it("only puts a one-time login code in the redirect, never the access token", async () => {
    const { state } = await startLogin();
    const res = await callback({ code: "google-auth-code", state }, state);

    expect(res.headers.location).not.toMatch(/token=|eyJ/);
    expect(new URL(res.headers.location).search).toBe("");
  });

  it("clears the state cookie", async () => {
    const { state } = await startLogin();
    const res = await callback({ code: "google-auth-code", state }, state);

    const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";");
    expect(cookie).toMatch(/tor_oauth_state=;/);
  });

  describe("rejects a callback that this browser didn't start (login CSRF)", () => {
    it.each([
      ["without the state cookie", undefined],
      ["with another browser's state cookie", "A".repeat(43)],
    ])("%s", async (_label, cookieState) => {
      const { state } = await startLogin();

      const res = await callback({ code: "google-auth-code", state }, cookieState);

      expect(fragmentOf(res.headers.location).get("error")).toBe("invalid_request");
      expect(getTokenSpy).not.toHaveBeenCalled();
      expect(await User.countDocuments()).toBe(0);
    });
  });

  it("rejects an unknown state", async () => {
    const state = "B".repeat(43);

    const res = await callback({ code: "google-auth-code", state }, state);

    expect(fragmentOf(res.headers.location).get("error")).toBe("invalid_request");
  });

  it("rejects an expired state", async () => {
    const { state } = await startLogin();
    await OAuthState.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await callback({ code: "google-auth-code", state }, state);

    expect(fragmentOf(res.headers.location).get("error")).toBe("invalid_request");
  });

  it("accepts each state only once", async () => {
    const { state } = await startLogin();
    await callback({ code: "google-auth-code", state }, state);

    const replay = await callback({ code: "google-auth-code", state }, state);

    expect(fragmentOf(replay.headers.location).get("error")).toBe("invalid_request");
    expect(getTokenSpy).toHaveBeenCalledTimes(1);
  });

  it("reports a cancelled login when the user declines on Google", async () => {
    const { state } = await startLogin();

    const res = await callback({ error: "access_denied", state }, state);

    expect(fragmentOf(res.headers.location).get("error")).toBe("cancelled");
    expect(getTokenSpy).not.toHaveBeenCalled();
  });

  it("rejects a code that Google won't swap", async () => {
    getTokenSpy.mockRejectedValue(new Error("invalid_grant") as never);

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("invalid_request");
    expect(await User.countDocuments()).toBe(0);
  });

  it.each<[string, (nonce: string) => Payload]>([
    ["from another login (nonce mismatch)", (nonce) => googlePayload(nonce, { nonce: "C".repeat(43) })],
    ["without a nonce", (nonce) => googlePayload(nonce, { nonce: undefined })],
    ["from another issuer", (nonce) => googlePayload(nonce, { iss: "https://evil.example" })],
    ["for another app (audience)", (nonce) => googlePayload(nonce, { aud: "other-app.apps.googleusercontent.com" })],
    ["without a subject", (nonce) => googlePayload(nonce, { sub: undefined })],
  ])("rejects an ID token %s", async (_label, payload) => {
    googleReturns(payload);

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("invalid_token");
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects an ID token that fails signature or expiry checks", async () => {
    verifyIdTokenSpy.mockRejectedValue(new Error("Token used too late") as never);

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("invalid_token");
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects a Google account whose email isn't verified", async () => {
    googleReturns((nonce) => googlePayload(nonce, { email_verified: false }));

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("email_not_verified");
    expect(await User.countDocuments()).toBe(0);
  });
});

describe("account linking", () => {
  async function localUser(options: { verified: boolean; googleId?: string; status?: "active" | "disabled" }) {
    return User.create({
      name: "Local User",
      email: "somchai@gmail.com",
      passwordHash: await bcrypt.hash("local-password", 4),
      role: "end_user",
      status: options.status ?? "active",
      isEmailVerified: options.verified,
      googleId: options.googleId,
    });
  }

  it("finds a linked user by Google ID even if their email changed", async () => {
    const user = await User.create({
      name: "Linked",
      email: "old-address@gmail.com",
      googleId: "google-user-123",
      role: "end_user",
      status: "active",
      isEmailVerified: true,
    });

    const fragment = await completeLogin();
    const login = await exchange(fragment.get("code"));

    expect(verifyMfaSetupToken(login.body.setupToken).id).toBe(user._id.toString());
    expect(await User.countDocuments()).toBe(1);
  });

  it("links a verified local account and keeps its password", async () => {
    const user = await localUser({ verified: true });

    await completeLogin();

    const updated = await User.findById(user._id).select("+passwordHash");
    expect(updated!.googleId).toBe("google-user-123");
    expect(updated!.passwordHash).toBeDefined();
    const passwordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "somchai@gmail.com", password: "local-password" });
    expect(passwordLogin.status).toBe(202);
    expect(passwordLogin.body).toMatchObject({ mfaSetupRequired: true });
  });

  it("removes the password of an unverified account before linking it (pre-hijacking)", async () => {
    const user = await localUser({ verified: false });

    await completeLogin();

    const updated = await User.findById(user._id).select("+passwordHash +emailVerificationToken");
    expect(updated!.googleId).toBe("google-user-123");
    expect(updated!.isEmailVerified).toBe(true);
    expect(updated!.passwordHash).toBeUndefined();
    expect(updated!.tokenVersion).toBe(1);
    const attackerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "somchai@gmail.com", password: "local-password" });
    expect(attackerLogin.status).toBe(401);
  });

  it("refuses an account that is linked to a different Google account", async () => {
    await localUser({ verified: true, googleId: "another-google-user" });

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("account_conflict");
    expect((await User.findOne({ email: "somchai@gmail.com" }))!.googleId).toBe("another-google-user");
  });

  it.each([
    ["linked", "google-user-123"],
    ["not yet linked", undefined],
  ])("refuses a disabled account (%s)", async (_label, googleId) => {
    await localUser({ verified: true, googleId, status: "disabled" });

    const fragment = await completeLogin();

    expect(fragment.get("error")).toBe("account_disabled");
    expect(await OAuthLoginCode.countDocuments()).toBe(0);
  });
});

describe("POST /api/auth/google/exchange", () => {
  it("never hands out an access token without MFA", async () => {
    const fragment = await completeLogin();

    const res = await exchange(fragment.get("code"));

    expect(res.status).toBe(202);
    expect(res.body.token).toBeUndefined();
  });

  it("asks a user without MFA to set it up, like a correct password does", async () => {
    const fragment = await completeLogin();

    const res = await exchange(fragment.get("code"));

    expect(res.body).toMatchObject({ mfaSetupRequired: true });
    const user = await User.findOne({ email: "somchai@gmail.com" });
    expect(verifyMfaSetupToken(res.body.setupToken)).toMatchObject({
      id: user!._id.toString(),
      tokenVersion: user!.tokenVersion,
    });
  });

  it("completes the first Google login through MFA setup", async () => {
    const fragment = await completeLogin();
    const firstFactor = await exchange(fragment.get("code"));

    const setup = await request(app)
      .post("/api/auth/mfa/setup")
      .set("Authorization", `Bearer ${firstFactor.body.setupToken}`);
    const confirmed = await request(app)
      .post("/api/auth/mfa/confirm-setup")
      .set("Authorization", `Bearer ${firstFactor.body.setupToken}`)
      .send({ code: await generate({ secret: setup.body.secret }) });

    expect(confirmed.status).toBe(200);
    const user = await User.findOne({ email: "somchai@gmail.com" });
    expect(user!.mfaEnabled).toBe(true);
    expect(verifyAccessToken(confirmed.body.token)).toMatchObject({ id: user!._id.toString(), role: "end_user" });
  });

  it("asks a user with MFA for their authenticator code, then logs them in", async () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    await User.create({
      name: "Has MFA",
      email: "somchai@gmail.com",
      googleId: "google-user-123",
      role: "end_user",
      status: "active",
      isEmailVerified: true,
      mfaEnabled: true,
      mfaSecretEncrypted: encryptMfaSecret(secret),
      tokenVersion: 3,
    });
    const fragment = await completeLogin();

    const firstFactor = await exchange(fragment.get("code"));
    expect(firstFactor.status).toBe(202);
    expect(firstFactor.body).toMatchObject({ mfaRequired: true });

    const verified = await request(app)
      .post("/api/auth/mfa/verify")
      .send({ challengeToken: firstFactor.body.challengeToken, code: await generate({ secret }) });

    expect(verified.status).toBe(200);
    expect(verifyAccessToken(verified.body.token)).toMatchObject({ tokenVersion: 3 });
  });

  it("rejects a wrong authenticator code after Google login", async () => {
    await User.create({
      name: "Has MFA",
      email: "somchai@gmail.com",
      googleId: "google-user-123",
      role: "end_user",
      status: "active",
      isEmailVerified: true,
      mfaEnabled: true,
      mfaSecretEncrypted: encryptMfaSecret("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"),
    });
    const fragment = await completeLogin();
    const firstFactor = await exchange(fragment.get("code"));

    const verified = await request(app)
      .post("/api/auth/mfa/verify")
      .send({ challengeToken: firstFactor.body.challengeToken, code: "000000" });

    expect(verified.status).toBe(401);
    expect(verified.body.token).toBeUndefined();
  });

  it("accepts each login code only once", async () => {
    const fragment = await completeLogin();
    await exchange(fragment.get("code"));

    const second = await exchange(fragment.get("code"));

    expect(second.status).toBe(401);
  });

  it("gives only one token when the same code is sent twice at once", async () => {
    const fragment = await completeLogin();

    const results = await Promise.all([
      request(app).post("/api/auth/google/exchange").send({ code: fragment.get("code") }),
      request(app).post("/api/auth/google/exchange").send({ code: fragment.get("code") }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([202, 401]);
  });

  it("rejects an expired login code", async () => {
    const fragment = await completeLogin();
    await OAuthLoginCode.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post("/api/auth/google/exchange").send({ code: fragment.get("code") });

    expect(res.status).toBe(401);
  });

  it("refuses a user who was disabled after the code was issued", async () => {
    const fragment = await completeLogin();
    await User.updateMany({}, { status: "disabled" });

    const res = await request(app).post("/api/auth/google/exchange").send({ code: fragment.get("code") });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["no code", {}],
    ["a code that isn't a string", { code: { $gt: "" } }],
    ["a code in the wrong format", { code: "short" }],
    ["extra fields", { code: "D".repeat(43), role: "admin" }],
  ])("rejects %s (400)", async (_label, body) => {
    const res = await request(app).post("/api/auth/google/exchange").send(body as object);

    expect(res.status).toBe(400);
  });
});

describe("password routes for Google-only accounts", () => {
  async function googleOnlyUser() {
    return User.create({
      name: "Google Only",
      email: "google-only@gmail.com",
      googleId: "google-only-1",
      role: "end_user",
      status: "active",
      isEmailVerified: true,
    });
  }

  it("answers a password login like a wrong password (401), not with a server error", async () => {
    await googleOnlyUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "google-only@gmail.com", password: "any-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("doesn't accept the server's dummy password for an account without a password", async () => {
    await googleOnlyUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "google-only@gmail.com", password: "not-a-real-password" });

    expect(res.status).toBe(401);
    expect(res.body.setupToken).toBeUndefined();
  });

  it("refuses to change a password the account doesn't have (400)", async () => {
    const user = await googleOnlyUser();
    const token = signAccessToken({ id: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });

    const res = await request(app)
      .put("/api/users/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "guess-password", newPassword: "A-much-stronger-passphrase-2026!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Google/);
  });

  it("still requires a password for accounts without Google", async () => {
    await expect(
      User.create({ name: "No Password", email: "nopass@example.test", role: "end_user", status: "active" }),
    ).rejects.toThrow(/passwordHash/);
  });
});
