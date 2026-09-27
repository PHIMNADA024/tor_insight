import { Router } from "express";
import { Notification } from "../models/notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * List the current user's notifications.
 * GET /api/notifications?filter=unread|read
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;

    const query: Record<string, unknown> = { userId: req.user!.id };
    if (filter === "unread") query.isRead = false;
    if (filter === "read") query.isRead = true;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    const unreadCount = await Notification.countDocuments({
      userId: req.user!.id,
      isRead: false,
    });

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load notifications" });
  }
});

/**
 * Mark one notification as read.
 * PATCH /api/notifications/:id/read
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.isRead = true;
    await notification.save();

    return res.json({ message: "Marked as read", notification });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update notification" });
  }
});

/**
 * Mark all of the user's notifications as read.
 * PATCH /api/notifications/read-all
 */
router.patch("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user!.id, isRead: false },
      { isRead: true },
    );

    return res.json({ message: "All marked as read" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update notifications" });
  }
});

export default router;