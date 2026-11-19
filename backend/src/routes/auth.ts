import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { User } from "../models/user.js";
import { signAccessToken, signMfaSetupToken, verifyMfaSetupToken } from "../services/token.js";
import { sendVerificationEmail } from "../services/email.js";
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "../services/email.js";
import { createTotpSecret, createTotpUri, decryptMfaSecret, encryptMfaSecret, verifyTotp } from "../services/mfa.js";
import { hashPassword, verifyPassword } from "../services/passwordHash.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimit.js";
import { isBoundedString, isEmailAddress, isRecord } from "../middleware/validation.js";
import { checkPasswordLength, passwordPolicyMessage, validateNewPassword } from "../services/passwordPolicy.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
const GENERIC_AUTH_FAILURE = { message: "Invalid email or password" };
const GENERIC_VERIFICATION_FAILURE = { message: "Invalid or expired verification code" };
const GENERIC_RESEND_RESPONSE = { message: "If the account needs verification, a code has been sent." };
const GENERIC_REGISTRATION_RESPONSE = {
  message: "If registration can be completed, verification instructions will be sent.",
};
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", 12);
const MFA_SETUP_UNAVAILABLE = "MFA setup is temporarily unavailable";
const MIN_ENUMERATION_RESPONSE_MS = 250;

function normalizeEnumerationTiming(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const sendJson = res.json.bind(res) as (body?: unknown) => Response;
  res.json = ((body?: unknown) => {
    const remaining = MIN_ENUMERATION_RESPONSE_MS - (Date.now() - startedAt);
    if (remaining <= 0) return sendJson(body);
    setTimeout(() => {
      if (!res.destroyed) sendJson(body);
    }, remaining);
    return res;
  }) as Response["json"];
  next();
}

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Register
 * POST /api/auth/register
 */
router.post("/register", authLimiter, normalizeEnumerationTiming, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { name, email, password } = req.body;
    if (Object.keys(req.body).some((field) => !["name", "email", "password"].includes(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (!isBoundedString(name, 1, 100)) {
      return res.status(400).json({ message: "ชื่อต้องมีความยาว 1–100 ตัวอักษร" });
    }
    if (!isEmailAddress(email)) {
      return res.status(400).json({ message: "กรุณากรอกอีเมลให้ถูกต้อง" });
    }
    const lengthFailure = checkPasswordLength(password);
    if (typeof password !== "string" || lengthFailure === "too_short") {
      return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    }
    if (lengthFailure === "too_long") {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
    }
    const passwordCheck = await validateNewPassword(password);
    if (!passwordCheck.ok) {
      const status = passwordCheck.reason === "unavailable" ? 503 : 400;
      return res.status(status).json({ message: passwordPolicyMessage(passwordCheck.reason) });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = name.trim();

    const passwordHash = await hashPassword(password);
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(201).json(GENERIC_REGISTRATION_RESPONSE);
    }

    const otp = generateOTP();

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      passwordHashScheme: "bcrypt_sha256",
      role: "end_user",
      status: "active",
      isEmailVerified: false,
      emailVerificationToken: otp,
      emailVerificationExpires: new Date(
        Date.now() + 10 * 60 * 1000,
      ),
    });

    sendVerificationEmail(normalizedEmail, otp).catch((error) => {
      console.error("Failed to send verification email:", error);
    });

    return res.status(201).json({
      ...GENERIC_REGISTRATION_RESPONSE,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(201).json(GENERIC_REGISTRATION_RESPONSE);
    }
    console.error(error);

    return res.status(500).json({
      message: "Registration failed",
    });
  }
});

router.post("/login", authLimiter, normalizeEnumerationTiming, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { email, password } = req.body;
    if (Object.keys(req.body).some((field) => !["email", "password"].includes(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (!isEmailAddress(email)) {
      return res.status(400).json({ message: "กรุณากรอกอีเมลให้ถูกต้อง" });
    }
    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ message: "กรุณากรอกรหัสผ่าน" });
    }
    if (checkPasswordLength(password) === "too_long") {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash +mfaSecretEncrypted");

    const isMatch = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      user?.passwordHashScheme === "bcrypt_sha256" ? "bcrypt_sha256" : "bcrypt",
    );
    // Google-only accounts have no password; without the passwordHash check the
    // dummy hash above would make its known password work for them.
    if (!user?.passwordHash || !isMatch || user.status !== "active" || !user.isEmailVerified) {
      return res.status(401).json(GENERIC_AUTH_FAILURE);
    }

    if (user.passwordHashScheme !== "bcrypt_sha256") {
      user.passwordHash = await hashPassword(password);
      user.passwordHashScheme = "bcrypt_sha256";
    }

    if (!user.mfaEnabled) {
      await user.save();
      return res.status(202).json({
        mfaSetupRequired: true,
        setupToken: signMfaSetupToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 }),
      });
    }

    if (!user.mfaSecretEncrypted) return res.status(401).json(GENERIC_AUTH_FAILURE);
    const challengeToken = crypto.randomBytes(32).toString("hex");
    user.mfaLoginChallengeHash = hashToken(challengeToken);
    user.mfaLoginChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    return res.status(202).json({ mfaRequired: true, challengeToken });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Login failed" });
  }
});

function mfaSetupUser(req: import("express").Request) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyMfaSetupToken(token);
}

function accessTokenResponse(user: InstanceType<typeof User>) {
  return {
    message: "Login successful",
    token: signAccessToken({
      id: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    }),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/** Begin mandatory TOTP enrollment after successful password authentication. */
router.post("/mfa/setup", authLimiter, async (req, res) => {
  try {
    const claims = mfaSetupUser(req);
    const user = await User.findById(claims.id).select("+mfaPendingSecretEncrypted +mfaSetupExpiresAt");
    if (!user || user.status !== "active" || (user.tokenVersion ?? 0) !== claims.tokenVersion || user.mfaEnabled) {
      return res.status(401).json({ message: "MFA setup session expired" });
    }

    let secret: string;
    if (user.mfaPendingSecretEncrypted && user.mfaSetupExpiresAt && user.mfaSetupExpiresAt > new Date()) {
      secret = decryptMfaSecret(user.mfaPendingSecretEncrypted);
    } else {
      secret = createTotpSecret(user.email).secret;
      user.mfaPendingSecretEncrypted = encryptMfaSecret(secret);
      user.mfaSetupExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
    }

    return res.json({
      secret,
      otpauthUri: createTotpUri(user.email, secret),
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error("MFA setup failed:", error);
    const status = error instanceof Error && error.message.includes("MFA_ENCRYPTION_KEY") ? 503 : 401;
    return res.status(status).json({ message: status === 503 ? MFA_SETUP_UNAVAILABLE : "MFA setup session expired" });
  }
});

/** Confirm TOTP enrollment before issuing the first application session. */
router.post("/mfa/confirm-setup", otpLimiter, async (req, res) => {
  try {
    if (!isRecord(req.body) || Object.keys(req.body).some((field) => field !== "code") ||
      typeof req.body.code !== "string" || !/^\d{6}$/.test(req.body.code)) {
      return res.status(400).json({ message: "Enter a valid six-digit authenticator code" });
    }
    const claims = mfaSetupUser(req);
    const user = await User.findById(claims.id).select("+mfaPendingSecretEncrypted +mfaSetupExpiresAt");
    if (!user || user.status !== "active" || (user.tokenVersion ?? 0) !== claims.tokenVersion ||
      user.mfaEnabled || !user.mfaPendingSecretEncrypted || !user.mfaSetupExpiresAt ||
      user.mfaSetupExpiresAt <= new Date()) {
      return res.status(400).json({ message: "MFA setup has expired. Sign in again to restart setup." });
    }

    const secret = decryptMfaSecret(user.mfaPendingSecretEncrypted);
    const verification = await verifyTotp(secret, req.body.code);
    if (!verification) return res.status(400).json({ message: "Invalid authenticator code" });

    user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
    user.mfaPendingSecretEncrypted = undefined;
    user.mfaSetupExpiresAt = undefined;
    user.mfaEnabled = true;
    user.mfaLastUsedTimeStep = verification.timeStep;
    user.lastLoginAt = new Date();
    user.lastActivityAt = user.lastLoginAt;
    await user.save();

    return res.json(accessTokenResponse(user));
  } catch (error) {
    console.error("MFA enrollment confirmation failed:", error);
    return res.status(401).json({ message: "MFA setup session expired" });
  }
});

/** Complete login with a time-based one-time password from an authenticator app. */
router.post("/mfa/verify", otpLimiter, async (req, res) => {
  try {
    if (!isRecord(req.body) || Object.keys(req.body).some((field) => !["challengeToken", "code"].includes(field)) ||
      typeof req.body.challengeToken !== "string" || !/^[a-f0-9]{64}$/i.test(req.body.challengeToken) ||
      typeof req.body.code !== "string" || !/^\d{6}$/.test(req.body.code)) {
      return res.status(401).json(GENERIC_AUTH_FAILURE);
    }

    const challengeHash = hashToken(req.body.challengeToken);
    const user = await User.findOne({
      mfaLoginChallengeHash: challengeHash,
      mfaLoginChallengeExpiresAt: { $gt: new Date() },
      status: "active",
      mfaEnabled: true,
    }).select("+mfaSecretEncrypted +mfaLoginChallengeHash +mfaLoginChallengeExpiresAt");
    if (!user?.mfaSecretEncrypted) return res.status(401).json(GENERIC_AUTH_FAILURE);

    const verification = await verifyTotp(
      decryptMfaSecret(user.mfaSecretEncrypted),
      req.body.code,
      user.mfaLastUsedTimeStep ?? undefined,
    );
    if (!verification) return res.status(401).json(GENERIC_AUTH_FAILURE);

    const now = new Date();
    const consumed = await User.updateOne(
      {
        _id: user._id,
        status: "active",
        mfaEnabled: true,
        mfaLoginChallengeHash: challengeHash,
        mfaLoginChallengeExpiresAt: { $gt: now },
        $or: [
          { mfaLastUsedTimeStep: { $lt: verification.timeStep } },
          { mfaLastUsedTimeStep: { $exists: false } },
        ],
      },
      {
        $set: {
          mfaLastUsedTimeStep: verification.timeStep,
          lastLoginAt: now,
          lastActivityAt: now,
        },
        $unset: { mfaLoginChallengeHash: 1, mfaLoginChallengeExpiresAt: 1 },
      },
      { timestamps: false },
    );
    if (consumed.modifiedCount !== 1) return res.status(401).json(GENERIC_AUTH_FAILURE);

    const authenticatedUser = await User.findById(user._id);
    if (!authenticatedUser) return res.status(401).json(GENERIC_AUTH_FAILURE);
    return res.json(accessTokenResponse(authenticatedUser));
  } catch (error) {
    console.error("MFA login verification failed:", error);
    return res.status(401).json(GENERIC_AUTH_FAILURE);
  }
});

/**
 * Verify email
 * POST /api/auth/verify-email
 */
router.post("/verify-email", otpLimiter, normalizeEnumerationTiming, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { email, otp } = req.body;
    if (Object.keys(req.body).some((field) => !["email", "otp"].includes(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }

    if (!isEmailAddress(email) || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "A valid email and six-digit OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+emailVerificationToken +emailVerificationExpires",
    );

    if (!user) {
      return res.status(400).json(GENERIC_VERIFICATION_FAILURE);
    }

    if (user.isEmailVerified) {
      return res.status(400).json(GENERIC_VERIFICATION_FAILURE);
    }

    if (
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      return res.status(400).json(GENERIC_VERIFICATION_FAILURE);
    }

    if (user.emailVerificationToken !== otp) {
      return res.status(400).json(GENERIC_VERIFICATION_FAILURE);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;

    await user.save();

    return res.json({
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Email verification failed",
    });
  }
});

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
router.post("/resend-otp", otpLimiter, normalizeEnumerationTiming, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { email } = req.body;
    if (Object.keys(req.body).some((field) => field !== "email")) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    if (!isEmailAddress(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.json(GENERIC_RESEND_RESPONSE);
    }
    if (user.isEmailVerified) {
      return res.json(GENERIC_RESEND_RESPONSE);
    }

    const otp = generateOTP();
    user.emailVerificationToken = otp;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    sendVerificationEmail(normalizedEmail, otp).catch((error) => {
      console.error("Failed to resend verification email:", error);
    });

    return res.json(GENERIC_RESEND_RESPONSE);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to resend code" });
  }
});

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
router.post("/forgot-password", authLimiter, normalizeEnumerationTiming, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { email } = req.body;
    if (Object.keys(req.body).some((field) => field !== "email")) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }

    if (!isEmailAddress(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    const genericResponse = {
      message:
        "If an account with that email exists, a reset link has been sent.",
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = hashToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    sendPasswordResetEmail(normalizedEmail, resetLink).catch((error) => {
      // Keep the response and response timing identical for known and unknown addresses.
      console.error("Failed to send password reset email:", error);
    });

    return res.json(genericResponse);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to process request" });
  }
});

/**
 * Reset password
 * POST /api/auth/reset-password
 */
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { email, token, newPassword } = req.body;
    if (Object.keys(req.body).some((field) => !["email", "token", "newPassword"].includes(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }

    if (!isEmailAddress(email) || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        message: "ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่",
      });
    }
    if (typeof newPassword !== "string") {
      return res.status(400).json({ message: passwordPolicyMessage("too_short") });
    }
    const passwordCheck = await validateNewPassword(newPassword);
    if (!passwordCheck.ok) {
      const status = passwordCheck.reason === "unavailable" ? 503 : 400;
      return res.status(status).json({ message: passwordPolicyMessage(passwordCheck.reason) });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    if (user.passwordResetExpires < new Date() || user.passwordResetToken !== hashToken(token)) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordHashScheme = "bcrypt_sha256";
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.mfaLoginChallengeHash = undefined;
    user.mfaLoginChallengeExpiresAt = undefined;

    await user.save();
    sendPasswordChangedEmail(user.email, user.name).catch((error) => {
      console.error("Failed to send password change notification:", error);
    });

    return res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to reset password" });
  }
});

/**
 * Revoke all active access tokens for the current account.
 * POST /api/auth/logout
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user!.id },
      {
        $inc: { tokenVersion: 1 },
        $unset: { mfaLoginChallengeHash: 1, mfaLoginChallengeExpiresAt: 1 },
      },
    );
    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to log out" });
  }
});

/**
 * Current user
 * GET /api/auth/me
 */
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;