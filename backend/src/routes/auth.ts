import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { User } from "../models/user.js";
import { signAccessToken } from "../services/token.js";
import { sendVerificationEmail } from "../services/email.js";
import { sendPasswordResetEmail } from "../services/email.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimit.js";
import { isBoundedString, isEmailAddress, isRecord } from "../middleware/validation.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

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
router.post("/register", authLimiter, async (req, res) => {
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
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = name.trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const otp = generateOTP();

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role: "end_user",
      status: "active",
      isEmailVerified: false,
      emailVerificationToken: otp,
      emailVerificationExpires: new Date(
        Date.now() + 10 * 60 * 1000,
      ),
    });

    await sendVerificationEmail(normalizedEmail, otp);

    return res.status(201).json({
      message: "Registration successful. Verification code sent.",
      userId: user._id,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Registration failed",
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
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
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+passwordHash",
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.status === "disabled") {
      return res.status(403).json({
        message: "This account has been disabled",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        userId: user._id,
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signAccessToken({
      id: user._id.toString(),
      role: user.role,
    });

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Login failed" });
  }
});

/**
 * Verify email
 * POST /api/auth/verify-email
 */
router.post("/verify-email", otpLimiter, async (req, res) => {
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
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: "Email is already verified",
      });
    }

    if (
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      return res.status(400).json({
        message: "OTP has expired",
      });
    }

    if (user.emailVerificationToken !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
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
router.post("/resend-otp", otpLimiter, async (req, res) => {
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
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const otp = generateOTP();
    user.emailVerificationToken = otp;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(normalizedEmail, otp);

    return res.json({ message: "Verification code resent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to resend code" });
  }
});

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
router.post("/forgot-password", authLimiter, async (req, res) => {
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

    await sendPasswordResetEmail(normalizedEmail, resetLink);

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
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    }
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({ message: "Reset link has expired" });
    }

    if (user.passwordResetToken !== hashToken(token)) {
      return res.status(400).json({ message: "Invalid reset link" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();

    await user.save();

    return res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to reset password" });
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