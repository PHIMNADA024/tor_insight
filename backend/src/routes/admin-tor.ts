import { Router } from "express";
import { Tor } from "../models/index.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { notifyMatchingUsers } from "../jobs/notify-matches.js";

const router = Router();

/**
 * List TORs pending review.
 * GET /api/admin/tors?status=draft
 */
router.get("/tors", requireAuth, requireAdmin, async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const validStatuses = ["draft", "published", "archived"] as const;

    if (requestedStatus && !validStatuses.includes(requestedStatus as (typeof validStatuses)[number])) {
      return res.status(400).json({ message: "Invalid TOR status" });
    }

    const status: (typeof validStatuses)[number] =
      (requestedStatus as (typeof validStatuses)[number] | undefined) ?? "draft";
    const tors = await Tor.find({ status }).sort({ createdAt: -1 }).limit(100);

    return res.json({ tors });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load TORs" });
  }
});

/**
 * Approve a draft TOR — publishes it and triggers notifications.
 * POST /api/admin/tors/:id/approve
 */
router.post("/tors/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tor = await Tor.findById(req.params.id);

    if (!tor) {
      return res.status(404).json({ message: "TOR not found" });
    }

    const previousStatus = tor.status;
    tor.status = "published";
    await tor.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "tor.status_change",
      targetType: "Tor",
      targetId: tor._id,
      metadata: { from: previousStatus, to: "published" },
    });

    return res.json({ message: "TOR published", tor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to approve TOR" });
  }
});

/**
 * Reject a draft TOR — archives it, no notification sent.
 * POST /api/admin/tors/:id/reject
 */
router.post("/tors/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tor = await Tor.findById(req.params.id);

    if (!tor) {
      return res.status(404).json({ message: "TOR not found" });
    }

    const previousStatus = tor.status;
    tor.status = "archived";
    await tor.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "tor.status_change",
      targetType: "Tor",
      targetId: tor._id,
      metadata: { from: previousStatus, to: "archived" },
    });

    return res.json({ message: "TOR archived", tor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to reject TOR" });
  }
});

export default router;