import { Router } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { User } from "../models/user.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { Feedback } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { sendAccountDisabledEmail, sendPasswordResetEmail } from "../services/email.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { isObjectId, isRecord } from "../middleware/validation.js";
import { checkPasswordLength } from "../services/passwordPolicy.js";
import { verifyPassword } from "../services/passwordHash.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * List users, optionally filtered by status or role.
 * GET /api/admin/users?status=active&role=end_user&search=name-or-email
 */
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, role, search } = req.query;
    if (Object.values(req.query).some((value) => typeof value !== "string")) {
      return res.status(400).json({ message: "กรุณาส่งค่าตัวกรองแต่ละรายการเพียงหนึ่งค่า" });
    }
    if (status !== undefined && status !== "active" && status !== "disabled") {
      return res.status(400).json({ message: "สถานะผู้ใช้ต้องเป็นใช้งานหรือระงับการใช้งาน" });
    }
    if (role !== undefined && role !== "end_user" && role !== "admin") {
      return res.status(400).json({ message: "ประเภทผู้ใช้ไม่ถูกต้อง" });
    }
    if (search !== undefined && (typeof search !== "string" || search.length > 100)) {
      return res.status(400).json({ message: "คำค้นหาต้องมีความยาวไม่เกิน 100 ตัวอักษร" });
    }
    const filter: Record<string, unknown> = {};

    if (typeof status === "string" && status) filter.status = status;
    if (typeof role === "string" && role) filter.role = role;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("name email role status isEmailVerified createdAt lastLoginAt")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json({ users });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load users" });
  }
});

/**
 * Disable a user account.
 * PATCH /api/admin/users/:id/disable
 */
router.patch("/users/:id/disable", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสผู้ใช้ไม่ถูกต้อง" });
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user!.id) {
      return res.status(400).json({ message: "You cannot disable your own account" });
    }

    if (user.status === "disabled") {
      return res.status(400).json({ message: "User is already disabled" });
    }

    user.status = "disabled";
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.mfaLoginChallengeHash = undefined;
    user.mfaLoginChallengeExpiresAt = undefined;
    await user.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.disable",
      targetType: "User",
      targetId: user._id,
      metadata: { from: "active", to: "disabled" },
    });

    sendAccountDisabledEmail(user.email, user.name).catch((error) => {
        console.error(`Failed to send disable notification to user ${user._id}:`, error);
    });

    return res.json({ message: "User disabled" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to disable user" });
  }
});

/**
 * Send a one-time reset link to the selected user without revealing or choosing a password.
 * POST /api/admin/users/:id/password-reset
 */
router.post("/users/:id/password-reset", requireAuth, requireAdmin, authLimiter, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสผู้ใช้ไม่ถูกต้อง" });
    if (req.body !== undefined && (!isRecord(req.body) || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ message: "This endpoint does not accept a request body" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = hashToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
    try {
      await sendPasswordResetEmail(user.email, resetLink);
    } catch (error) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      throw error;
    }

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.password_reset",
      targetType: "User",
      targetId: user._id,
      metadata: { method: "email_link" },
    });

    return res.json({ message: "Password reset instructions sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to initiate password reset" });
  }
});

/** Revoke all sessions and pending MFA challenges for one account without disabling it. */
router.post("/users/:id/sessions/revoke", requireAuth, requireAdmin, authLimiter, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสผู้ใช้ไม่ถูกต้อง" });
    if (req.body !== undefined && (!isRecord(req.body) || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ message: "This endpoint does not accept a request body" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.mfaLoginChallengeHash = undefined;
    user.mfaLoginChallengeExpiresAt = undefined;
    await user.save();
    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.sessions_revoke",
      targetType: "User",
      targetId: user._id,
      metadata: { tokenVersion: user.tokenVersion },
    });
    return res.json({ message: "User sessions revoked" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to revoke user sessions" });
  }
});

/** Revoke every account's sessions, including the administrator's current session. */
router.post("/users/sessions/revoke-all", requireAuth, requireAdmin, authLimiter, async (req, res) => {
  try {
    if (req.body !== undefined && (!isRecord(req.body) || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ message: "This endpoint does not accept a request body" });
    }
    const result = await User.updateMany({}, {
      $inc: { tokenVersion: 1 },
      $unset: { mfaLoginChallengeHash: 1, mfaLoginChallengeExpiresAt: 1 },
    });
    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "users.sessions_revoke_all",
      targetType: "User",
      targetId: req.user!.id,
      metadata: { accountsAffected: result.modifiedCount },
    });
    return res.json({ message: "All user sessions revoked", accountsAffected: result.modifiedCount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to revoke all sessions" });
  }
});

/**
 * Re-enable a disabled user account.
 * PATCH /api/admin/users/:id/enable
 */
router.patch("/users/:id/enable", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสผู้ใช้ไม่ถูกต้อง" });
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status === "active") {
      return res.status(400).json({ message: "User is already active" });
    }

    user.status = "active";
    await user.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.enable",
      targetType: "User",
      targetId: user._id,
      metadata: { from: "disabled", to: "active" },
    });

    return res.json({ message: "User enabled" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to enable user" });
  }
});

/**
 * Permanently delete a user account.
 * DELETE /api/admin/users/:id
 */
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสผู้ใช้ไม่ถูกต้อง" });
    if (!isRecord(req.body) || Object.keys(req.body).some((field) => field !== "currentPassword") ||
      typeof req.body.currentPassword !== "string" || req.body.currentPassword.length === 0 ||
      checkPasswordLength(req.body.currentPassword) === "too_long") {
      return res.status(400).json({ message: "Current password is required" });
    }

    const actor = await User.findById(req.user!.id).select("+passwordHash");
    // Google-only accounts have no password, so they can't confirm this action.
    if (!actor?.passwordHash ||
      !(await verifyPassword(req.body.currentPassword, actor.passwordHash, actor.passwordHashScheme))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user!.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    // All four writes succeed together or none of them do, so a failure halfway
    // can't leave a deleted user's feedback behind or a log entry for a delete that never happened.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await AdminActionLog.create(
          [
            {
              actorId: req.user!.id,
              action: "user.delete",
              targetType: "User",
              targetId: user._id,
              metadata: { name: user.name, email: user.email, role: user.role },
            },
          ],
          { session },
        );
        await Feedback.deleteMany({ userId: user._id }, { session });
        await Notification.deleteMany({ userId: user._id }, { session });
        await User.deleteOne({ _id: user._id }, { session });
      });
    } finally {
      await session.endSession();
    }

    return res.json({ message: "User deleted" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

export default router;