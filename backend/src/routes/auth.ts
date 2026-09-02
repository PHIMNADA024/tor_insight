import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/user.js";
import { signAccessToken } from "../services/token.js";
import { sendVerificationEmail } from "../services/email.js";

const router = Router();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

export default router;