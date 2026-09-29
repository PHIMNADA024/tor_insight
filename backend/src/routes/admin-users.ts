import { Router } from "express";
import { User } from "../models/user.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { Feedback } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { sendAccountDisabledEmail } from "../services/email.js";

const router = Router();

/**
 * List users, optionally filtered by status or role.
 * GET /api/admin/users?status=active&role=end_user&search=name-or-email
 */
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, role, search } = req.query;
    const filter: Record<string, unknown> = {};

    if (typeof status === "string" && status) filter.status = status;
    if (typeof role === "string" && role) filter.role = role;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
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
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user!.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "user.delete",
      targetType: "User",
      targetId: user._id,
      metadata: { name: user.name, email: user.email, role: user.role },
    });
    await Feedback.deleteMany({ userId: user._id });
    await Notification.deleteMany({ userId: user._id });
    await user.deleteOne();

    return res.json({ message: "User deleted" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

export default router;