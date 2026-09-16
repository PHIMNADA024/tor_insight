import { Router } from "express";
import { Feedback } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { User } from "../models/user.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { sendFeedbackResolvedEmail } from "../services/email.js";

const router = Router();

/**
 * List feedback for admin review.
 * GET /api/admin/feedback?status=pending
 */
router.get("/feedback", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const filter = status ? { status } : {};

    const items = await Feedback.find(filter)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ feedback: items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load feedback" });
  }
});

/**
 * Respond to and resolve a feedback item — notifies the user
 * in-app and by email.
 * PATCH /api/admin/feedback/:id
 */
router.patch("/feedback/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, adminResponse } = req.body;

    if (!status || !["pending", "reviewed", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" });
    }

    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    const previousStatus = feedback.status;
    feedback.status = status;

    if (typeof adminResponse === "string" && adminResponse.trim()) {
      feedback.adminResponse = adminResponse.trim();
    }

    if (status === "resolved") {
      feedback.resolvedBy = req.user!.id as any;
      feedback.resolvedAt = new Date();
    }

    await feedback.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "feedback.status_change",
      targetType: "Feedback",
      targetId: feedback._id,
      metadata: { from: previousStatus, to: status },
    });

    // Notify the user only when there's an actual response to show them
    if (feedback.adminResponse) {
      const user = await User.findById(feedback.userId);

      if (user) {
        await Notification.create({
          userId: user._id,
          type: "feedback_resolved",
          title: "ข้อเสนอแนะของคุณได้รับการตอบกลับ",
          message: feedback.adminResponse,
          relatedId: feedback._id,
        });

        if (user.notifyByEmail) {
          sendFeedbackResolvedEmail(
            user.email,
            user.name,
            feedback.description,
            feedback.adminResponse,
          ).catch((error) => {
            console.error("Failed to send feedback response email:", error);
          });
        }
      }
    }

    return res.json({ message: "Feedback updated", feedback });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update feedback" });
  }
});

export default router;