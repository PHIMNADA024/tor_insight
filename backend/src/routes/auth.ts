import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { User } from "../models/user.js";
import { signAccessToken } from "../services/token.js";
import { sendVerificationEmail } from "../services/email.js";
import { sendPasswordResetEmail } from "../services/email.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Register
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

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
      name,
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

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
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
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
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
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
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
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
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
router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        message: "Email, token and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
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

export default router;