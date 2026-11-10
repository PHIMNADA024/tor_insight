import { Router } from "express";
import { Feedback, type FeedbackDoc } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { User } from "../models/user.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { sendFeedbackResolvedEmail } from "../services/email.js";
import { isObjectId, isRecord } from "../middleware/validation.js";

const router = Router();

/**
 * List feedback for admin review.
 * GET /api/admin/feedback?status=pending
 */
router.get("/feedback", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (Object.values(req.query).some((value) => typeof value !== "string")) {
      return res.status(400).json({ message: "กรุณาส่งค่าตัวกรองแต่ละรายการเพียงหนึ่งค่า" });
    }
    const validStatuses = ["pending", "reviewed", "resolved"] as const;

    if (status && !validStatuses.includes(status as (typeof validStatuses)[number])) {
      return res.status(400).json({ message: "Invalid feedback status" });
    }

    const filter: { status?: FeedbackDoc["status"] } = {};
    if (status) filter.status = status as FeedbackDoc["status"];

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
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "รหัสข้อเสนอแนะไม่ถูกต้อง" });
    if (!isRecord(req.body)) return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    if (Object.keys(req.body).some((field) => !["status", "adminResponse"].includes(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { status, adminResponse } = req.body;

    if (typeof status !== "string" || !["pending", "reviewed", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" });
    }
    const validatedStatus = status as FeedbackDoc["status"];

    if (adminResponse !== undefined && (typeof adminResponse !== "string" || adminResponse.length > 2000)) {
      return res.status(400).json({ message: "คำตอบต้องมีความยาวไม่เกิน 2,000 ตัวอักษร" });
    }
    if (status !== "pending" && (typeof adminResponse !== "string" || !adminResponse.trim())) {
      return res.status(400).json({
        message: "A response is required when updating feedback status",
      });
    }

    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    const previousStatus = feedback.status;
    feedback.status = validatedStatus;

    if (typeof adminResponse === "string" && adminResponse.trim()) {
      feedback.adminResponse = adminResponse.trim();
    }

    if (validatedStatus === "resolved") {
      feedback.resolvedBy = req.user!.id as any;
      feedback.resolvedAt = new Date();
    }

    await feedback.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "feedback.status_change",
      targetType: "Feedback",
      targetId: feedback._id,
      metadata: { from: previousStatus, to: validatedStatus },
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