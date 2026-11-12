import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/user.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { Feedback } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { sendAccountDisabledEmail } from "../services/email.js";
import { isObjectId } from "../middleware/validation.js";

const router = Router();

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
    await user.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.disable",
      targetType: "User",
      targetId: user._id,
      metadata: { from: "active", to: "disabled" },
    });

    sendAccountDisabledEmail(user.email, user.name).catch((error) => {
        console.error(`Failed to send disable notification to ${user.email}:`, error);
    });

    return res.json({ message: "User disabled" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to disable user" });
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