import { Router } from "express";
import { Feedback } from "../models/feedback.js";
import { Notification } from "../models/notification.js";
import { User } from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";
import { sendNewFeedbackAdminEmail } from "../services/email.js";

const router = Router();

const VALID_CATEGORIES = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
  "app_feedback",
  "other",
];

const CATEGORY_LABELS: Record<string, string> = {
  incorrect_info: "ข้อมูลไม่ถูกต้อง",
  outdated_info: "ข้อมูลล้าสมัย",
  broken_link: "ลิงก์ใช้งานไม่ได้",
  app_feedback: "ข้อเสนอแนะเกี่ยวกับแอป",
  other: "อื่นๆ",
};

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TOR_REFERENCE_LENGTH = 200;

const CATEGORIES_REQUIRING_REFERENCE = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
];

const MAX_SUBMISSIONS_PER_DAY = 10;

/**
 * Notify all admins, in-app and by email, that new feedback arrived.
 */
async function notifyAdminsOfNewFeedback(
  feedbackId: string,
  submitterName: string,
  category: string,
  description: string,
  torReference?: string,
) {
  const admins = await User.find({ role: "admin", status: "active" });

  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  await Notification.insertMany(
    admins.map((admin) => ({
      userId: admin._id,
      type: "new_feedback",
      title: "มีข้อเสนอแนะใหม่รอตรวจสอบ",
      message: `${submitterName} ส่งข้อเสนอแนะประเภท "${categoryLabel}"`,
      relatedId: feedbackId,
    })),
  );

  for (const admin of admins) {
    if (!admin.notifyByEmail) continue;

    sendNewFeedbackAdminEmail(
      admin.email,
      submitterName,
      categoryLabel,
      description,
      torReference,
    ).catch((error) => {
      console.error(`Failed to send new-feedback email to ${admin.email}:`, error);
    });
  }
}

/**
 * Submit feedback — general app feedback or a TOR-specific problem.
 * POST /api/feedback
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, description, torId, torReference } = req.body;

    // --- Required fields ---
    if (!category || typeof category !== "string") {
      return res.status(400).json({ message: "Category is required" });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "Description is required" });
    }

    const trimmedDescription = description.trim();

    // --- Description length ---
    if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
      });
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description must be under ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
    
    // --- TOR reference required for TOR-specific categories ---
    const trimmedReference =
      typeof torReference === "string" ? torReference.trim() : "";

    if (
      CATEGORIES_REQUIRING_REFERENCE.includes(category) &&
      !torId &&
      !trimmedReference
    ) {      
        return res.status(400).json({
        message: "Please specify which TOR this feedback relates to",
      });
    }

    if (trimmedReference.length > MAX_TOR_REFERENCE_LENGTH) {
      return res.status(400).json({
        message: `TOR reference must be under ${MAX_TOR_REFERENCE_LENGTH} characters`,
      });
    }

    // --- torId shape check, if provided ---
    if (torId && !/^[0-9a-fA-F]{24}$/.test(torId)) {
      return res.status(400).json({ message: "Invalid TOR id" });
    }

    // --- Rate limiting: prevent spam submissions ---
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await Feedback.countDocuments({
      userId: req.user!.id,
      createdAt: { $gte: oneDayAgo },
    });

    if (recentCount >= MAX_SUBMISSIONS_PER_DAY) {
      return res.status(429).json({
        message: "You've reached the daily feedback submission limit. Please try again tomorrow.",
      });
    }

    // --- Duplicate check: same user, same description, very recently ---
    const recentDuplicate = await Feedback.findOne({
      userId: req.user!.id,
      description: trimmedDescription,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });

    if (recentDuplicate) {
      return res.status(409).json({
        message: "You've already submitted this feedback recently",
      });
    }

    const feedback = await Feedback.create({
      userId: req.user!.id,
      category,
      description: trimmedDescription,
      torId: torId || undefined,
      torReference: trimmedReference || undefined,
    });

    notifyAdminsOfNewFeedback(
      feedback._id.toString(),
      req.user!.name,
      category,
      trimmedDescription,
      trimmedReference || undefined,
    ).catch((error) => {
      console.error("Failed to notify admins of new feedback:", error);
    });

    return res.status(201).json({ message: "Feedback submitted", feedback });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to submit feedback" });
  }
});

/**
 * My submitted feedback, with status.
 * GET /api/feedback/mine
 */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const items = await Feedback.find({ userId: req.user!.id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ feedback: items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load feedback" });
  }
});

export default router;